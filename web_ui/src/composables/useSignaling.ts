import { ref, onUnmounted, watch } from 'vue'
import { useRoomStore } from '@/stores/room'
import { useLogStore } from '@/stores/log'
import type { SignalingMessage, SignalingMessageType } from '@/types/signaling'
import type { SignalingTransport } from '@/types/transport'
import { createTransport } from '@/transports/factory'

interface UseSignalingOptions {
  roomId: string
  transport?: SignalingTransport
}

export function useSignaling(options: UseSignalingOptions | string) {
  const roomId = typeof options === 'string' ? options : options.roomId
  const providedTransport = typeof options === 'object' ? options.transport : undefined

  const store = useRoomStore()
  const logStore = useLogStore()

  // Transport reference (starts as provided or null)
  let transport: SignalingTransport | null = providedTransport ?? null

  const connected = ref(false)
  const signalingOffline = ref(false)
  const reconnectExhausted = ref(false)

  let _p2pEstablished = false
  let userMessageHandler: ((msg: SignalingMessage) => void) | null = null
  let transportInitialized = false

  function setMessageHandler(handler: (msg: SignalingMessage) => void) {
    userMessageHandler = handler
  }

  function handleInternalMessage(msg: SignalingMessage) {
    switch (msg.type) {
      case 'join-ack': {
        const payload = msg.payload as { participantId: string; turnCredentials?: unknown }
        store.setParticipantId(payload.participantId)
        logStore.info('signaling', 'Join-ack received', {
          participantId: payload.participantId.slice(0, 8),
          hasTurnCredentials: !!payload.turnCredentials
        })
        break
      }
      case 'peer-joined': {
        const peerId = (msg.payload as { participantId: string }).participantId
        // Don't add ourselves as a participant
        if (peerId === store.participantId) {
          logStore.info('signaling', 'Ignoring peer-joined for self', { peerId: peerId.slice(0, 8) })
          break
        }
        store.addParticipant(peerId)
        logStore.info('signaling', 'Peer joined', { peerId: peerId.slice(0, 8) })
        break
      }
      case 'peer-left': {
        const peerId = (msg.payload as { participantId: string }).participantId
        store.removeParticipant(peerId)
        logStore.info('signaling', 'Peer left', { peerId: peerId.slice(0, 8) })
        break
      }
    }
  }

  // Initialize transport if not provided
  async function initTransport() {
    if (transportInitialized) return
    transportInitialized = true

    if (providedTransport) {
      transport = providedTransport
    } else {
      // Use factory to auto-detect mode
      transport = await createTransport({ roomId })
    }

    // Set up message routing
    transport.onMessage((msg: SignalingMessage) => {
      handleInternalMessage(msg)
      userMessageHandler?.(msg)
    })

    // Watch for connection state changes
    watch(
      () => transport?.connected.value,
      (isConnected) => {
        if (isConnected) {
          logStore.info('signaling', 'Connected to signaling server')
        } else {
          logStore.warn('signaling', 'Disconnected from signaling server')
        }
      }
    )
  }

  async function connect() {
    await initTransport()
    connected.value = true
    transport?.connect()
  }

  function send(type: SignalingMessageType, to?: string, payload?: unknown) {
    const msg: SignalingMessage = { type, to, payload }
    transport?.send(msg)
  }

  function setP2PEstablished(value: boolean) {
    _p2pEstablished = value
  }

  async function disconnect() {
    logStore.info('signaling', 'Disconnecting from signaling server')
    transport?.disconnect()
    transport = null
    connected.value = false
  }

  onUnmounted(() => {
    transport?.disconnect()
  })

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

// For explicit async transport creation
export async function createSignalingTransport(
  options: UseSignalingOptions
): Promise<SignalingTransport> {
  return createTransport(options)
}