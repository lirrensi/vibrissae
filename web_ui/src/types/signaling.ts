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
  turnCredentials?: {
    username: string
    password: string
  }
}

export interface ErrorPayload {
  code: number
  message: string
}
