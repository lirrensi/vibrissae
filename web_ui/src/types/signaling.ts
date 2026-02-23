export type SignalingMessageType = 
  | 'join-ack' 
  | 'peer-joined' 
  | 'peer-left' 
  | 'offer' 
  | 'answer' 
  | 'ice-candidate' 
  | 'error'

export interface SignalingMessage {
  type: SignalingMessageType
  from?: string
  to?: string
  payload?: unknown
}

export interface JoinAckPayload {
  participantId: string
  roomId: string
  turnCredentials?: {
    username: string
    password: string
  }
  existingPeers: string[]
  initiatorId: string
}

export interface PeerJoinedPayload {
  participantId: string
  initiatorId: string
}

export interface PeerLeftPayload {
  participantId: string
}

export interface ErrorPayload {
  code: number
  message: string
}
