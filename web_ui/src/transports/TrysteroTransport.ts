import { ref, onUnmounted } from 'vue'
import { joinRoom, type Room, type ActionSender, type BaseRoomConfig, type RelayConfig, type TurnConfig } from 'trystero'
import { useLogStore } from '@/stores/log'
import type { SignalingMessage } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import type { P2PConfig, TransportType } from '@/types/p2p-config'

// Type for Trystero messages (must satisfy DataPayload/JsonValue)
type SignalPayload = Record<string, string | number | boolean | null>

export interface TrysteroTransportOptions {
  roomId: string
  config: P2PConfig
  onConnect?: () => void
  onDisconnect?: () => void
}

// Store for each transport type
interface TransportEntry {
  room: Room
  send: ActionSender<SignalPayload>
}

// Map trystero peerId -> our participantId
type PeerIdMap = Map<string, string>

export function createTrysteroTransport(options: TrysteroTransportOptions): SignalingTransport {
  const { roomId, config, onConnect, onDisconnect } = options

  const logStore = useLogStore()

  const connected = ref(false)
  const participantId = ref<string | null>(null)
  const activeTransports = new Map<TransportType, TransportEntry>()
  const messageHandler = ref<((msg: SignalingMessage) => void) | null>(null)

  // For P2P handshake: map trysteroPeerId -> participantId
  const peerIdMaps = new Map<TransportType, PeerIdMap>()

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
      case 'mqtt': {
        const mc = config.transports.mqtt
        if (!mc?.enabled) return null
        return {
          ...base,
          relayUrls: mc.url ? [mc.url] : [
            'wss://public.mqtthq.com',
            'wss://broker.hivemq.com',
            'wss://mqtt.eclipseprojects.io'
          ]
        }
      }
      case 'ipfs': {
        const ic = config.transports.ipfs
        if (!ic?.enabled) return null
        return {
          ...base,
          // IPFS uses default bootstrap nodes if not specified
          ...(ic.bootstrap ? { bootstrap: ic.bootstrap } : {})
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

      // Initialize peerId map for this transport
      const peerIdMap = new Map<string, string>()
      peerIdMaps.set(type, peerIdMap)

      // Handle peer join - send hello with our participantId
      room.onPeerJoin((trysteroPeerId: string) => {
        logStore.info('signaling', `Peer discovered via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        
        // Send hello message to exchange participantIds
        const helloMsg: SignalingMessage = {
          type: 'hello',
          from: participantId.value!,
          payload: { participantId: participantId.value }
        }
        
        const entry = activeTransports.get(type)
        if (entry) {
          // Send directly to this peer
          entry.send(helloMsg as unknown as SignalPayload, trysteroPeerId)
          logStore.info('signaling', `Sent hello to peer via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        }
      })

      room.onPeerLeave((trysteroPeerId: string) => {
        logStore.info('signaling', `Peer left via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        
        // Look up the participantId for this trystero peer
        const map = peerIdMaps.get(type)
        const participantId = map?.get(trysteroPeerId)
        
        if (participantId) {
          // Notify app layer
          const leaveMsg: SignalingMessage = {
            type: 'peer-left',
            from: participantId,
            payload: { participantId }
          }
          messageHandler.value?.(leaveMsg)
          
          // Clean up
          map?.delete(trysteroPeerId)
        }
      })

      // Subscribe to messages
      const [send, receive] = room.makeAction<SignalPayload>('signal')

      receive((data, trysteroPeerId: string) => {
        if (!data || typeof data !== 'object') return

        const msg = data as unknown as SignalingMessage

        // Handle P2P handshake
        if (msg.type === 'hello') {
          handleHello(type, trysteroPeerId, msg, peerIdMap)
          return
        }

        // For other messages, filter by recipient
        if (msg.to && msg.to !== participantId.value) return

        // Enrich with from field (look up participantId from map)
        const map = peerIdMaps.get(type)
        const fromParticipantId = map?.get(trysteroPeerId) || msg.from

        const enriched: SignalingMessage = {
          ...msg,
          from: fromParticipantId
        }

        messageHandler.value?.(enriched)
      })

      activeTransports.set(type, { room, send })

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

  // Handle hello message - exchange participantIds and determine initiator
  function handleHello(
    type: TransportType,
    trysteroPeerId: string,
    msg: SignalingMessage,
    peerIdMap: PeerIdMap
  ) {
    const payload = msg.payload as { participantId: string }
    const theirParticipantId = payload.participantId

    if (!theirParticipantId) {
      logStore.warn('signaling', `Received hello without participantId`)
      return
    }

    logStore.info('signaling', `Received hello from peer via ${type}`, { 
      trysteroPeerId: trysteroPeerId.slice(0, 8),
      participantId: theirParticipantId.slice(0, 8)
    })

    // Store the mapping
    peerIdMap.set(trysteroPeerId, theirParticipantId)

    // Determine initiator: lexicographically smaller participantId initiates
    const myId = participantId.value!
    const theirId = theirParticipantId
    const iAmInitiator = myId < theirId
    const initiatorId = iAmInitiator ? myId : theirId

    logStore.info('signaling', `Initiator election`, {
      myId: myId.slice(0, 8),
      theirId: theirId.slice(0, 8),
      iAmInitiator,
      initiatorId: initiatorId.slice(0, 8)
    })

    // Emit peer-joined to app layer
    const joinedMsg: SignalingMessage = {
      type: 'peer-joined',
      from: theirParticipantId,
      payload: {
        participantId: theirParticipantId,
        initiatorId
      }
    }
    messageHandler.value?.(joinedMsg)
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
    peerIdMaps.clear()

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

    // Send to all active transports (broadcast - Trystero will route to correct peer if 'to' is set)
    activeTransports.forEach(({ send }, type) => {
      try {
        send(enriched as unknown as SignalPayload)
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
            send(pending.msg as unknown as SignalPayload)
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
    case 'mqtt':
      return config.transports.mqtt?.enabled ?? false
    case 'ipfs':
      return config.transports.ipfs?.enabled ?? false
    default:
      return false
  }
}
