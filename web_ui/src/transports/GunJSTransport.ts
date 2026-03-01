import { ref, onUnmounted } from 'vue'
import type { MessageTransport, TransportMessage } from '@/types/transport'
import { useLogStore } from '@/stores/log'
import Gun from 'gun'

export interface GunJSTransportOptions {
  roomId: string
  /**
   * List of Gun relay peers to connect to.
   * If not provided, will use default public Gun peers.
   * Example: ['https://gun-manhattan.herokuapp.com/gun']
   */
  peers?: string[]
}

/**
 * GunJS Transport - Full implementation
 * 
 * This provides a MessageTransport interface using GunJS for P2P data sync.
 * GunJS uses a decentralized graph database approach for peer-to-peer communication.
 * 
 * Architecture:
 * - Room data is stored at: gun.get(roomId)
 * - Broadcast messages: gun.get(roomId).set(message) - all peers receive
 * - Direct messages: gun.get(roomId).get(peerId).put(message) - specific peer receives
 * - Peer discovery: We track peers by listening to connection 'hi' events
 */
export function createGunJSTransport(options: GunJSTransportOptions): MessageTransport {
  const { roomId, peers = [] } = options
  const logStore = useLogStore()
  
  const connected = ref(false)
  const selfId = ref<string>(crypto.randomUUID())
  
  const onMessageHandler = ref<((msg: TransportMessage, fromPeerId: string) => void) | null>(null)
  const onPeerJoinHandler = ref<((peerId: string) => void) | null>(null)
  const onPeerLeaveHandler = ref<((peerId: string) => void) | null>(null)
  
  // GunJS instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gunInstance: any = null
  
  // Track discovered peers
  const discoveredPeers = new Set<string>()
  
  // Default public Gun peers if none provided
  const defaultPeers = [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://gun-eu.herokuapp.com/gun'
  ]
  
  const peerList = peers.length > 0 ? peers : defaultPeers
  
  async function connect(): Promise<void> {
    logStore.info('transport', `Connecting GunJS transport`, { 
      roomId,
      peers: peerList.length
    })
    
    try {
      // Initialize Gun instance with peers
      gunInstance = Gun({
        peers: peerList,
        localStorage: false,  // Disable local storage for cleaner behavior
        radisk: false        // Disable radisk in browser
      })
      
      // Set up peer discovery via 'hi' event (handshake when peer connects)
      // GunJS emits 'hi' when a peer connects
      gunInstance.on('hi', (peer: unknown) => {
        // peer is the peer ID/url
        const peerId = typeof peer === 'string' ? peer : JSON.stringify(peer)
        if (!discoveredPeers.has(peerId) && peerId !== selfId.value) {
          discoveredPeers.add(peerId)
          logStore.info('transport', `GunJS peer joined`, { peerId: peerId.slice(0, 16) })
          onPeerJoinHandler.value?.(peerId)
        }
      })
      
      // Set up peer leave detection via 'bye' event
      gunInstance.on('bye', (peer: unknown) => {
        const peerId = typeof peer === 'string' ? peer : JSON.stringify(peer)
        if (discoveredPeers.has(peerId)) {
          discoveredPeers.delete(peerId)
          logStore.info('transport', `GunJS peer left`, { peerId: peerId.slice(0, 16) })
          onPeerLeaveHandler.value?.(peerId)
        }
      })
      
      // Subscribe to room messages (broadcast channel)
      // Using .map() to iterate over all messages in the room
      const room = gunInstance.get(roomId)
      
      // Listen for broadcast messages (messages without specific 'to' field)
      room.map().on((data: unknown, key: string) => {
        if (!data || typeof data !== 'object') return
        
        const msg = data as TransportMessage
        
        // Skip our own messages
        if (msg.from === selfId.value) return
        
        // Skip messages intended for specific peers (those have 'to' field)
        if (msg.to) return
        
        // Skip internal GunJS metadata
        if (key === '_' || key === '.') return
        
        logStore.info('transport', `GunJS received broadcast`, { 
          type: msg.type,
          from: msg.from?.slice(0, 8)
        })
        
        onMessageHandler.value?.(msg, msg.from || 'unknown')
      })
      
      // Also listen to a dedicated broadcast path for cleaner messaging
      const broadcastPath = gunInstance.get(roomId).get('broadcast')
      broadcastPath.map().on((data: unknown, key: string) => {
        if (!data || typeof data !== 'object') return
        
        const msg = data as TransportMessage
        
        // Skip our own messages
        if (msg.from === selfId.value) return
        
        // Skip internal GunJS metadata
        if (key === '_' || key === '.') return
        
        logStore.info('transport', `GunJS received broadcast (via broadcast path)`, { 
          type: msg.type,
          from: msg.from?.slice(0, 8)
        })
        
        onMessageHandler.value?.(msg, msg.from || 'unknown')
      })
      
      // Wait a moment for initial connections
      await new Promise(resolve => setTimeout(resolve, 500))
      
      connected.value = true
      logStore.info('transport', `GunJS transport connected`, { 
        roomId,
        selfId: selfId.value.slice(0, 8)
      })
      
    } catch (err) {
      logStore.error('transport', `GunJS transport connection failed: ${err}`)
      // Don't throw - allow transport to work in degraded mode
      connected.value = true // Mark as connected anyway for fallback behavior
    }
  }
  
  function disconnect() {
    logStore.info('transport', `Disconnecting GunJS transport`)
    
    if (gunInstance) {
      // Clean up Gun instance
      try {
        gunInstance.off()
      } catch {
        // Ignore cleanup errors
      }
      gunInstance = null
    }
    
    discoveredPeers.clear()
    connected.value = false
  }
  
  function broadcast(message: TransportMessage) {
    if (!connected.value) {
      logStore.warn('transport', `Cannot broadcast - not connected`)
      return
    }
    
    if (!gunInstance) {
      logStore.warn('transport', `Cannot broadcast - GunJS not initialized`)
      return
    }
    
    const msg: TransportMessage = {
      ...message,
      from: selfId.value
    }
    
    try {
      // Use broadcast path for cleaner message separation
      // Generate unique key for each message to avoid conflicts
      const msgKey = crypto.randomUUID()
      const broadcastPath = gunInstance.get(roomId).get('broadcast').get(msgKey)
      
      // Set the message - this syncs to all connected peers
      broadcastPath.put(msg)
      
      logStore.info('transport', `GunJS broadcast sent`, { 
        type: message.type,
        key: msgKey.slice(0, 8)
      })
    } catch (err) {
      logStore.error('transport', `GunJS broadcast failed: ${err}`)
    }
  }
  
  function sendTo(peerId: string, message: TransportMessage) {
    if (!connected.value) {
      logStore.warn('transport', `Cannot send - not connected`)
      return
    }
    
    if (!gunInstance) {
      logStore.warn('transport', `Cannot send - GunJS not initialized`)
      return
    }
    
    const msg: TransportMessage = {
      ...message,
      from: selfId.value,
      to: peerId
    }
    
    try {
      // Write to peer's specific path
      // GunJS will only deliver to the peer that's listening on this path
      const peerPath = gunInstance.get(roomId).get('direct').get(peerId).get(crypto.randomUUID())
      peerPath.put(msg)
      
      logStore.info('transport', `GunJS direct message sent`, { 
        type: message.type,
        to: peerId.slice(0, 8)
      })
    } catch (err) {
      logStore.error('transport', `GunJS sendTo failed: ${err}`)
    }
    
    // Also try broadcasting via the peer's subscriber path
    // This is a fallback in case the direct path doesn't work
    try {
      const subscriberPath = gunInstance.get(roomId).get('peers').get(peerId).get(selfId.value)
      subscriberPath.put(msg)
    } catch {
      // Ignore fallback errors
    }
  }
  
  // Set up listener for direct messages (incoming)
  // This needs to be called after connect
  function setupDirectMessageListener() {
    if (!gunInstance) return
    
    // Listen for direct messages sent to us
    const directPath = gunInstance.get(roomId).get('direct').get(selfId.value)
    directPath.map().on((data: unknown, key: string) => {
      if (!data || typeof data !== 'object') return
      
      const msg = data as TransportMessage
      
      // Skip our own messages
      if (msg.from === selfId.value) return
      
      // Skip internal GunJS metadata
      if (key === '_' || key === '.') return
      
      // Only receive messages intended for us
      if (msg.to && msg.to !== selfId.value) return
      
      logStore.info('transport', `GunJS received direct message`, { 
        type: msg.type,
        from: msg.from?.slice(0, 8)
      })
      
      onMessageHandler.value?.(msg, msg.from || 'unknown')
    })
    
    // Also listen on peers path for peer discovery messages
    const peersPath = gunInstance.get(roomId).get('peers')
    peersPath.map().on((data: unknown, peerKey: string) => {
      if (!data || typeof data !== 'object') return
      if (peerKey === '_' || peerKey === '.') return
      
      const msg = data as TransportMessage
      
      // Skip our own messages
      if (msg.from === selfId.value) return
      
      // Track new peers from messages
      if (!discoveredPeers.has(peerKey)) {
        discoveredPeers.add(peerKey)
        logStore.info('transport', `GunJS peer discovered via message`, { 
          peerId: peerKey.slice(0, 16)
        })
        onPeerJoinHandler.value?.(peerKey)
      }
      
      logStore.info('transport', `GunJS received peer message`, { 
        type: msg.type,
        from: msg.from?.slice(0, 8)
      })
      
      onMessageHandler.value?.(msg, msg.from || 'unknown')
    })
  }
  
  function onMessage(handler: (msg: TransportMessage, fromPeerId: string) => void) {
    onMessageHandler.value = handler
    
    // Set up direct message listener once handler is registered
    if (gunInstance && connected.value) {
      setupDirectMessageListener()
    }
  }
  
  function onPeerJoin(handler: (peerId: string) => void) {
    onPeerJoinHandler.value = handler
  }
  
  function onPeerLeave(handler: (peerId: string) => void) {
    onPeerLeaveHandler.value = handler
  }
  
  onUnmounted(disconnect)
  
  return {
    get connected() { return connected },
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