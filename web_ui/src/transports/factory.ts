import { useLogStore } from '@/stores/log'
import type { SignalingTransport } from '@/types/transport'
import { createWebSocketTransport } from './WebSocketTransport'
import { createTrysteroTransport } from './TrysteroTransport'
import { loadP2PConfig } from '@/utils/p2p-config-loader'

export type TransportMode = 'auto' | 'websocket' | 'p2p'

interface CreateTransportOptions {
  roomId: string
  mode?: TransportMode
}

export async function createTransport(options: CreateTransportOptions): Promise<SignalingTransport> {
  const { roomId, mode = 'auto' } = options
  const logStore = useLogStore()

  // Determine mode
  const effectiveMode = determineMode(mode)

  logStore.info('signaling', `Transport mode: ${effectiveMode}`)

  switch (effectiveMode) {
    case 'websocket':
      return createWebSocketTransport(roomId)

    case 'p2p': {
      const config = await loadP2PConfig()
      return createTrysteroTransport({ roomId, config })
    }

    default:
      throw new Error(`Unknown transport mode: ${effectiveMode}`)
  }
}

function determineMode(requestedMode: TransportMode): 'websocket' | 'p2p' {
  if (requestedMode === 'websocket') return 'websocket'
  if (requestedMode === 'p2p') return 'p2p'

  // Auto-detect:
  // - If window.__CONFIG__ exists (server-injected), use WebSocket
  // - Otherwise, use P2P
  if (typeof window !== 'undefined' && (window as unknown as { __CONFIG__?: unknown }).__CONFIG__) {
    console.log('[TransportFactory] Auto-detected: server-hosted mode')
    return 'websocket'
  }

  console.log('[TransportFactory] Auto-detected: P2P mode')
  return 'p2p'
}

// For non-async usage
export function createWebSocketTransportSync(roomId: string): SignalingTransport {
  return createWebSocketTransport(roomId)
}