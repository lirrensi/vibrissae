import { ref, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { SignalingMessage, SignalingMessageType } from '@/types/signaling'

export function useSignaling(roomId: string) {
  const store = useRoomStore()
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const signalingOffline = ref(false)
  const reconnectExhausted = ref(false)
  
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const baseDelay = 1000
  let p2pEstablished = false
  
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsHost = window.__CONFIG__?.baseUrl 
    ? window.__CONFIG__.baseUrl.replace(/^https?:/, wsProtocol)
    : `${wsProtocol}//${window.location.host}`
  
  function connect() {
    const url = `${wsHost}/ws/${roomId}`
    ws.value = new WebSocket(url)
    
    ws.value.onopen = () => {
      connected.value = true
      reconnectAttempts.value = 0
      signalingOffline.value = false
      console.log('WebSocket connected')
    }
    
    ws.value.onmessage = (event) => {
      const msg: SignalingMessage = JSON.parse(event.data)
      handleMessage(msg)
    }
    
    ws.value.onclose = handleDisconnect
    ws.value.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }
  
  function handleDisconnect() {
    connected.value = false
    
    if (p2pEstablished) {
      // Don't reconnect, just show indicator
      signalingOffline.value = true
      return
    }
    
    if (reconnectAttempts.value < maxReconnectAttempts) {
      const delay = baseDelay * Math.pow(2, reconnectAttempts.value)
      setTimeout(connect, delay)
      reconnectAttempts.value++
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value})`)
    } else {
      // Signal that we've given up
      reconnectExhausted.value = true
      console.error('Signaling reconnect exhausted')
    }
  }
  
  function handleMessage(msg: SignalingMessage) {
    switch (msg.type) {
      case 'join-ack':
        store.setParticipantId((msg.payload as { participantId: string }).participantId)
        break
      case 'peer-joined':
        store.addParticipant(msg.from!)
        break
      case 'peer-left':
        store.removeParticipant(msg.from!)
        break
      // offer, answer, ice-candidate handled by useWebRTC
    }
  }
  
  function send(type: SignalingMessageType, to?: string, payload?: unknown) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
    
    const msg: SignalingMessage = { type, to, payload }
    ws.value.send(JSON.stringify(msg))
  }
  
  function setP2PEstablished(value: boolean) {
    p2pEstablished = value
  }
  
  function onMessage(callback: (msg: SignalingMessage) => void) {
    ws.value!.onmessage = (event) => {
      const msg: SignalingMessage = JSON.parse(event.data)
      handleMessage(msg)
      callback(msg)
    }
  }
  
  function disconnect() {
    ws.value?.close()
    ws.value = null
  }
  
  onUnmounted(disconnect)
  
  return {
    ws,
    connected,
    signalingOffline,
    reconnectExhausted,
    connect,
    send,
    setP2PEstablished,
    onMessage,
    disconnect
  }
}
