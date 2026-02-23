import type { Ref } from 'vue'
import type { SignalingMessage } from './signaling'

export interface SignalingTransport {
  connected: Ref<boolean>
  participantId: Ref<string | null>
  
  connect(): void
  disconnect(): void
  send(message: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): void
}
