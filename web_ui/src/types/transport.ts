import type { Ref } from 'vue'
import type { SignalingMessage } from './signaling'

// ============================================================
// MessageTransport Interface - Pure message passing layer
// ============================================================

export interface TransportMessage {
  type: string
  payload?: unknown
  from?: string
  to?: string
}

export interface MessageTransport {
  connected: Ref<boolean>
  selfId: string
  
  connect(): Promise<void>
  disconnect(): void
  broadcast(message: TransportMessage): void
  sendTo(peerId: string, message: TransportMessage): void
  
  onMessage(handler: (msg: TransportMessage, fromPeerId: string) => void): void
  onPeerJoin(handler: (peerId: string) => void): void
  onPeerLeave(handler: (peerId: string) => void): void
}

// ============================================================
// SignalingTransport - Higher-level signaling protocol
// ============================================================

export interface SignalingTransport {
  connected: Ref<boolean>
  participantId: Ref<string | null>
  
  connect(): void
  disconnect(): void
  send(message: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): void
}
