import { ref, onMounted, onUnmounted } from 'vue'
import { useRoomStore } from '@/stores/room'
import type { useWebRTC } from './useWebRTC'

export interface ChatMessage {
  id: string
  text: string
  from: string
  timestamp: number
  isLocal: boolean
}

export function useChat(webrtc: ReturnType<typeof useWebRTC>) {
  const store = useRoomStore()
  const messages = ref<ChatMessage[]>([])
  const isOpen = ref(false)
  
  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }
  
  function send(text: string) {
    const msg: Omit<ChatMessage, 'isLocal'> = {
      id: generateId(),
      text,
      from: store.participantId || 'unknown',
      timestamp: Date.now()
    }
    
    // Send to all peers
    webrtc.dataChannels.value.forEach(channel => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(msg))
      }
    })
    
    // Add to local messages
    messages.value.push({ ...msg, isLocal: true })
  }
  
  function handleIncoming(event: CustomEvent) {
    const { from, id, text, timestamp } = event.detail
    messages.value.push({
      id,
      text,
      from,
      timestamp,
      isLocal: false
    })
  }
  
  onMounted(() => {
    window.addEventListener('chat-message', handleIncoming as EventListener)
  })
  
  onUnmounted(() => {
    window.removeEventListener('chat-message', handleIncoming as EventListener)
  })
  
  return {
    messages,
    isOpen,
    send,
    toggle: () => isOpen.value = !isOpen.value
  }
}
