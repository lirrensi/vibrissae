import { ref, onUnmounted } from 'vue'
import { joinRoom, type Room, type ActionSender, type BaseRoomConfig, type RelayConfig, type TurnConfig } from 'trystero'
import { useLogStore } from '@/stores/log'
import type { TransportMessage, MessageTransport } from '@/types/transport'
import type { P2PConfig, TransportType } from '@/types/p2p-config'

type SignalPayload = Record<string, string | number | boolean | null>

export interface TrysteroTransportOptions {
  roomId: string
  config: P2PConfig
  onConnect?: () => void
  onDisconnect?: () => void
}

interface TransportEntry {
  room: Room
  send: ActionSender<SignalPayload>
}

export function createTrysteroTransport(options: TrysteroTransportOptions): MessageTransport {
  const { roomId, config, onConnect, onDisconnect } = options
  const logStore = useLogStore()
  
  const connected = ref(false)
  const selfId = ref<string>(crypto.randomUUID())
  
  const activeTransports = new Map<TransportType, TransportEntry>()
  const onMessageHandler = ref<((msg: TransportMessage, fromPeerId: string) => void) | null>(null)
  const onPeerJoinHandler = ref<((peerId: string) => void) | null>(null)
  const onPeerLeaveHandler = ref<((peerId: string) => void) | null>(null)
  
  function buildRoomConfig(type: TransportType): BaseRoomConfig & RelayConfig & TurnConfig | null {
    const base: BaseRoomConfig = { appId: 'vibrissae-p2p' }
    
    switch (type) {
      case 'torrent':
        const tc = config.transports.torrent
        if (!tc?.enabled) return null
        return { ...base, rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } }
      case 'nostr':
        const nc = config.transports.nostr
        if (!nc?.enabled) return null
        return { ...base, relayUrls: nc.relays ?? [] }
      case 'mqtt':
        const mc = config.transports.mqtt
        if (!mc?.enabled) return null
        return { ...base, relayUrls: mc.url ? [mc.url] : ['wss://public.mqtthq.com', 'wss://broker.hivemq.com', 'wss://mqtt.eclipseprojects.io'] }
      case 'ipfs':
        const ic = config.transports.ipfs
        if (!ic?.enabled) return null
        return { ...base, ...(ic.bootstrap ? { bootstrap: ic.bootstrap } : {}) }
      default:
        return null
    }
  }
  
  async function connectTransport(type: TransportType): Promise<boolean> {
    try {
      const roomConfig = buildRoomConfig(type)
      if (!roomConfig) return false
      
      const room = joinRoom(roomConfig as BaseRoomConfig & RelayConfig & TurnConfig, roomId)
      
      // Handle peer join
      room.onPeerJoin((trysteroPeerId: string) => {
        logStore.info('transport', `Peer joined via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        onPeerJoinHandler.value?.(trysteroPeerId)
      })
      
      // Handle peer leave
      room.onPeerLeave((trysteroPeerId: string) => {
        logStore.info('transport', `Peer left via ${type}`, { trysteroPeerId: trysteroPeerId.slice(0, 8) })
        onPeerLeaveHandler.value?.(trysteroPeerId)
      })
      
      // Subscribe to messages
      const [send, receive] = room.makeAction<SignalPayload>('signal')
      
      receive((data, trysteroPeerId: string) => {
        if (!data || typeof data !== 'object') return
        const msg = data as unknown as TransportMessage
        onMessageHandler.value?.(msg, trysteroPeerId)
      })
      
      activeTransports.set(type, { room, send })
      
      if (!connected.value) {
        connected.value = true
        logStore.info('transport', `Trystero connected: ${type}`)
        onConnect?.()
      }
      
      return true
    } catch (err) {
      logStore.error('transport', `Trystero transport ${type} failed: ${err}`)
      return false
    }
  }
  
  async function connect(): Promise<void> {
    logStore.info('transport', 'Connecting Trystero transports...', { transports: config.transports.priority })
    
    const promises = config.transports.priority.map(async (type) => {
      if (isTransportEnabled(type, config)) {
        await connectTransport(type)
      }
    })
    
    await Promise.all(promises)
  }
  
  function disconnect() {
    activeTransports.forEach(({ room }) => room.leave())
    activeTransports.clear()
    connected.value = false
    onDisconnect?.()
  }
  
  function broadcast(message: TransportMessage) {
    const payload = message as unknown as SignalPayload
    activeTransports.forEach(({ send }, type) => {
      try {
        send(payload)
      } catch (err) {
        logStore.error('transport', `Broadcast failed (${type}): ${err}`)
      }
    })
  }
  
  function sendTo(peerId: string, message: TransportMessage) {
    const payload = message as unknown as SignalPayload
    activeTransports.forEach(({ send }, type) => {
      try {
        send(payload, peerId)
      } catch (err) {
        logStore.error('transport', `Send to ${peerId.slice(0, 8)} failed (${type}): ${err}`)
      }
    })
  }
  
  function onMessage(handler: (msg: TransportMessage, fromPeerId: string) => void) {
    onMessageHandler.value = handler
  }
  
  function onPeerJoin(handler: (peerId: string) => void) {
    onPeerJoinHandler.value = handler
  }
  
  function onPeerLeave(handler: (peerId: string) => void) {
    onPeerLeaveHandler.value = handler
  }
  
  onUnmounted(disconnect)
  
  return {
    connected,
    selfId: selfId.value,
    connect,
    disconnect,
    broadcast,
    sendTo,
    onMessage,
    onPeerJoin,
    onPeerLeave
  }
}

function isTransportEnabled(type: TransportType, config: P2PConfig): boolean {
  switch (type) {
    case 'torrent': return config.transports.torrent?.enabled ?? false
    case 'nostr': return config.transports.nostr?.enabled ?? false
    case 'mqtt': return config.transports.mqtt?.enabled ?? false
    case 'ipfs': return config.transports.ipfs?.enabled ?? false
    default: return false
  }
}
