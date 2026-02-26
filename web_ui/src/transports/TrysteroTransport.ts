import { ref, onUnmounted } from 'vue'
import { joinRoom, type Room, type ActionSender, type BaseRoomConfig, type RelayConfig, type TurnConfig } from 'trystero'
import { useLogStore } from '@/stores/log'
import type { SignalingMessage } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import type { P2PConfig, TransportType } from '@/types/p2p-config'

export interface TrysteroTransportOptions {
  roomId: string
  config: P2PConfig
  onConnect?: () => void
  onDisconnect?: () => void
}

// Store for each transport type
interface TransportEntry {
  room: Room
  send: ActionSender<Record<string, unknown>>
}

export function createTrysteroTransport(options: TrysteroTransportOptions): SignalingTransport {
  const { roomId, config, onConnect, onDisconnect } = options

  const logStore = useLogStore()

  const connected = ref(false)
  const participantId = ref<string | null>(null)
  const activeTransports = new Map<TransportType, TransportEntry>()
  const messageHandler = ref<((msg: SignalingMessage) => void) | null>(null)

  // Generate unique participant ID
  participantId.value = crypto.randomUUID()

  let resendTimer: ReturnType<typeof setInterval> | null = null
  const pendingMessages = new Map<string, { msg: SignalingMessage; attempts: number }>()

  // Build room config based on transport type
  function buildRoomConfig(type: TransportType): BaseRoomConfig & RelayConfig & TurnConfig | null {
    const base: BaseRoomConfig = {
      appId: 'vibrissae-p2p'
    }

    switch (type) {
      case 'torrent': {
        const tc = config.transports.torrent
        if (!tc?.enabled) return null
        return {
          ...base,
          rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
        }
      }
      case 'nostr': {
        const nc = config.transports.nostr
        if (!nc?.enabled) return null
        return {
          ...base,
          relayUrls: nc.relays ?? []
        }
      }
      case 'gun': {
        const gc = config.transports.gun
        if (!gc?.enabled) return null
        return {
          ...base,
          // gunPeers is passed as a custom property
          ...({ gunPeers: gc.peers ?? [] } as Record<string, unknown>)
        }
      }
      default:
        return null
    }
  }

  async function connectTransport(type: TransportType): Promise<boolean> {
    try {
      const roomConfig = buildRoomConfig(type)
      if (!roomConfig) return false

      const room = joinRoom(roomConfig as BaseRoomConfig & RelayConfig & TurnConfig, roomId)

      // Handle incoming messages
      room.onPeerJoin((peerId: string) => {
        logStore.info('signaling', `Peer joined via ${type}`, { peerId: peerId.slice(0, 8) })
      })

      room.onPeerLeave((peerId: string) => {
        logStore.info('signaling', `Peer left via ${type}`, { peerId: peerId.slice(0, 8) })
      })

      // Subscribe to messages - use a type that satisfies DataPayload
      // DataPayload = JsonValue | Blob | ArrayBuffer | ArrayBufferView
      // JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }
      const [send, receive] = room.makeAction<Record<string, string | number | boolean | null>>('signal')

      receive((data, peerId: string) => {
        if (!data || typeof data !== 'object') return

        const msg = data as unknown as SignalingMessage

        // Filter messages not meant for us
        if (msg.to && msg.to !== participantId.value) return

        // Add from field if missing
        const enriched: SignalingMessage = {
          ...msg,
          from: msg.from || peerId
        }

        messageHandler.value?.(enriched)
      })

      activeTransports.set(type, { room, send: send as ActionSender<Record<string, unknown>> })

      // If this is first successful connection
      if (!connected.value) {
        connected.value = true
        logStore.info('signaling', `P2P transport connected: ${type}`)
        onConnect?.()
      }

      return true
    } catch (err) {
      logStore.error('signaling', `P2P transport ${type} failed: ${err}`)
      return false
    }
  }

  function connect() {
    logStore.info('signaling', 'Connecting P2P transports...', { transports: config.transports.priority })

    // Try all transports in parallel (happy eyeballs)
    const promises = config.transports.priority.map(async (type) => {
      if (isTransportEnabled(type, config)) {
        const success = await connectTransport(type)
        logStore.info('signaling', `P2P transport ${type}: ${success ? 'connected' : 'failed'}`)
      }
    })

    Promise.all(promises).then(() => {
      // Start resend timer for reliable signaling
      startResendTimer()
    })
  }

  function disconnect() {
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }

    activeTransports.forEach(({ room }) => room.leave())
    activeTransports.clear()

    connected.value = false
    logStore.info('signaling', 'P2P transports disconnected')
    onDisconnect?.()
  }

  function send(message: SignalingMessage) {
    // Add from field
    const enriched: SignalingMessage = {
      ...message,
      from: participantId.value!
    }

    // Send to all active transports
    activeTransports.forEach(({ send }, type) => {
      try {
        send(enriched as unknown as Record<string, unknown>)
      } catch (err) {
        logStore.error('signaling', `P2P send failed (${type}): ${err}`)
      }
    })

    // Track for resend
    if (message.type === 'offer') {
      const key = `${message.to}-${message.type}`
      pendingMessages.set(key, { msg: enriched, attempts: 0 })
    }
  }

  function onMessage(handler: (msg: SignalingMessage) => void) {
    messageHandler.value = handler
  }

  function startResendTimer() {
    if (resendTimer) return

    resendTimer = setInterval(() => {
      pendingMessages.forEach((pending, key) => {
        pending.attempts++

        if (pending.attempts >= config.signaling.resendMaxAttempts) {
          pendingMessages.delete(key)
          return
        }

        // Resend to all transports
        activeTransports.forEach(({ send }, type) => {
          try {
            send(pending.msg as unknown as Record<string, unknown>)
          } catch (err) {
            logStore.error('signaling', `P2P resend failed (${type}): ${err}`)
          }
        })
      })
    }, config.signaling.resendIntervalMs)
  }

  onUnmounted(disconnect)

  return {
    connected,
    participantId,
    connect,
    disconnect,
    send,
    onMessage
  }
}

function isTransportEnabled(type: TransportType, config: P2PConfig): boolean {
  switch (type) {
    case 'torrent':
      return config.transports.torrent?.enabled ?? false
    case 'nostr':
      return config.transports.nostr?.enabled ?? false
    case 'gun':
      return config.transports.gun?.enabled ?? false
    case 'ipfs':
      return config.transports.ipfs?.enabled ?? false
    case 'mqtt':
      return config.transports.mqtt?.enabled ?? false
    default:
      return false
  }
}