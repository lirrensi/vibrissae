import { ref, onUnmounted } from 'vue'
import type { SignalingMessage } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'

export function createWebSocketTransport(roomId: string): SignalingTransport {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const participantId = ref<string | null>(null)
  
  let messageHandler: ((msg: SignalingMessage) => void) | null = null
  
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsHost = window.__CONFIG__?.baseUrl 
    ? window.__CONFIG__.baseUrl.replace(/^https?:/, wsProtocol)
    : `${wsProtocol}//${window.location.host}`
  
  function connect() {
    const url = `${wsHost}/ws/${roomId}`
    ws.value = new WebSocket(url)
    
    ws.value.onopen = () => {
      connected.value = true
      console.log('[WebSocketTransport] Connected')
    }
    
    ws.value.onmessage = (event) => {
      const msg: SignalingMessage = JSON.parse(event.data)
      messageHandler?.(msg)
    }
    
    ws.value.onclose = () => {
      connected.value = false
      console.log('[WebSocketTransport] Disconnected')
    }
    
    ws.value.onerror = (err) => {
      console.error('[WebSocketTransport] Error:', err)
    }
  }
  
  function disconnect() {
    ws.value?.close()
    ws.value = null
    connected.value = false
  }
  
  function send(message: SignalingMessage) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocketTransport] Cannot send - not connected')
      return
    }
    ws.value.send(JSON.stringify(message))
  }
  
  function onMessage(handler: (msg: SignalingMessage) => void) {
    messageHandler = handler
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
