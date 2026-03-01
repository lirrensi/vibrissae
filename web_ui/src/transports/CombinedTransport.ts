import { ref, onUnmounted } from 'vue'
import type { MessageTransport, TransportMessage } from '@/types/transport'
import { useLogStore } from '@/stores/log'

export interface CombinedTransportConfig {
  onFirstConnect?: () => void
}

function debugLog(store: ReturnType<typeof useLogStore>, msg: string, data?: Record<string, unknown>) {
  // Use info as fallback since debug may not exist
  if (store.info) {
    store.info('transport', msg, data)
  }
}

export function createCombinedTransport(
  transports: MessageTransport[],
  config?: CombinedTransportConfig
): MessageTransport {
  const logStore = useLogStore()
  
  const connected = ref(false)
  const selfId = ref<string>(crypto.randomUUID())
  
  const onMessageHandler = ref<((msg: TransportMessage, fromPeerId: string) => void) | null>(null)
  const onPeerJoinHandler = ref<((peerId: string) => void) | null>(null)
  const onPeerLeaveHandler = ref<((peerId: string) => void) | null>(null)
  
  const connectedTransports = new Set<MessageTransport>()
  let hasCalledFirstConnect = false
  
  function handleMessage(msg: TransportMessage, fromPeerId: string, transport: MessageTransport) {
    // Enrich message with transport source info (optional)
    const enrichedMsg: TransportMessage = {
      ...msg,
      payload: {
        ...(msg.payload as object),
        _transport: transport.selfId || 'unknown'
      }
    }
    onMessageHandler.value?.(enrichedMsg, fromPeerId)
  }
  
  function handlePeerJoin(peerId: string, transport: MessageTransport) {
    logStore.info('transport', `Peer joined via multi-transport`, { 
      peerId: peerId.slice(0, 8),
      transportId: transport.selfId?.slice(0, 8) || 'unknown'
    })
    onPeerJoinHandler.value?.(peerId)
  }
  
  function handlePeerLeave(peerId: string, transport: MessageTransport) {
    logStore.info('transport', `Peer left via multi-transport`, { 
      peerId: peerId.slice(0, 8),
      transportId: transport.selfId?.slice(0, 8) || 'unknown'
    })
    onPeerLeaveHandler.value?.(peerId)
  }
  
  async function connect(): Promise<void> {
    logStore.info('transport', `Connecting ${transports.length} transports in parallel...`)
    
    // Connect all transports in parallel
    const connectPromises = transports.map(async (transport) => {
      try {
        // Wire up handlers for this transport
        transport.onMessage((msg, fromPeerId) => handleMessage(msg, fromPeerId, transport))
        transport.onPeerJoin((peerId) => handlePeerJoin(peerId, transport))
        transport.onPeerLeave((peerId) => handlePeerLeave(peerId, transport))
        
        // Connect the transport
        await transport.connect()
        connectedTransports.add(transport)
        
        logStore.info('transport', `Transport connected`, { 
          selfId: transport.selfId?.slice(0, 8) || 'unknown'
        })
        
        // Mark as connected on first transport success
        if (!hasCalledFirstConnect) {
          hasCalledFirstConnect = true
          connected.value = true
          config?.onFirstConnect?.()
          logStore.info('transport', `First transport connected - multi-transport ready`)
        }
      } catch (err) {
        logStore.error('transport', `Transport connection failed: ${err}`)
      }
    })
    
    await Promise.all(connectPromises)
    
    // If no transports connected, still mark as connected if at least one succeeded
    if (connectedTransports.size === 0 && transports.length > 0) {
      logStore.warn('transport', `No transports connected successfully`)
    }
  }
  
  function disconnect() {
    logStore.info('transport', `Disconnecting all transports`)
    
    connectedTransports.forEach((transport) => {
      try {
        transport.disconnect()
      } catch (err) {
        logStore.error('transport', `Error disconnecting transport: ${err}`)
      }
    })
    
    connectedTransports.clear()
    connected.value = false
    hasCalledFirstConnect = false
  }
  
  function broadcast(message: TransportMessage) {
    // Send to ALL transports
    const successCount = transports.reduce((count, transport) => {
      try {
        transport.broadcast(message)
        return count + 1
      } catch (err) {
        logStore.error('transport', `Broadcast failed on transport: ${err}`)
        return count
      }
    }, 0)
    
    debugLog(logStore, `Broadcast sent to ${successCount}/${transports.length} transports`)
  }
  
  function sendTo(peerId: string, message: TransportMessage) {
    // Send via ALL transports (let each transport handle peer resolution)
    const successCount = transports.reduce((count, transport) => {
      try {
        transport.sendTo(peerId, message)
        return count + 1
      } catch (err) {
        logStore.error('transport', `sendTo failed on transport: ${err}`)
        return count
      }
    }, 0)
    
    debugLog(logStore, `sendTo sent via ${successCount}/${transports.length} transports`)
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
