import { ref, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { SignalingMessage, SignalingMessageType } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import { createWebSocketTransport } from '@/transports/WebSocketTransport'

export function useSignaling(roomId: string, transport?: SignalingTransport) {
  const store = useRoomStore()
  
  // Use provided transport or create default WebSocket transport
  const t = transport ?? createWebSocketTransport(roomId)
  
  const connected = t.connected
  const signalingOffline = ref(false)
  const reconnectExhausted = ref(false)
  
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const baseDelay = 1000
  let p2pEstablished = false
  let userMessageHandler: ((msg: SignalingMessage) => void) | null = null
  
  function setMessageHandler(handler: (msg: SignalingMessage) => void) {
    userMessageHandler = handler
  }
  
  function handleInternalMessage(msg: SignalingMessage) {
    switch (msg.type) {
      case 'join-ack':
        store.setParticipantId((msg.payload as { participantId: string }).participantId)
        break
      case 'peer-joined':
        store.addParticipant((msg.payload as { participantId: string }).participantId)
        break
      case 'peer-left':
        store.removeParticipant((msg.payload as { participantId: string }).participantId)
        break
    }
  }
  
  // Set up message routing
  t.onMessage((msg: SignalingMessage) => {
    handleInternalMessage(msg)
    userMessageHandler?.(msg)
  })
  
  function connect() {
    t.connect()
  }
  
  function send(type: SignalingMessageType, to?: string, payload?: unknown) {
    const msg: SignalingMessage = { type, to, payload }
    t.send(msg)
  }
  
  function setP2PEstablished(value: boolean) {
    p2pEstablished = value
  }
  
  function disconnect() {
    t.disconnect()
  }
  
  onUnmounted(disconnect)
  
  return {
    connected,
    signalingOffline,
    reconnectExhausted,
    connect,
    send,
    setP2PEstablished,
    setMessageHandler,
    disconnect
  }
}
