import { useLogStore } from '@/stores/log'
import type { SignalingTransport, MessageTransport } from '@/types/transport'
import { createWebSocketTransport } from './WebSocketTransport'
import { createTrysteroTransport } from './TrysteroTransport'
import { createGunJSTransport } from './GunJSTransport'
import { createCombinedTransport } from './CombinedTransport'
import { createP2PSignalingProtocol } from './P2PSignalingProtocol'
import { loadP2PConfig } from '@/utils/p2p-config-loader'

export type TransportMode = 'auto' | 'websocket' | 'p2p'

/**
 * Supported P2P transport providers
 * - 'trystero': Uses Trystero library (Torrent, Nostr, MQTT, IPFS backends)
 * - 'gun': Uses GunJS for decentralized data sync
 */
export type P2PProvider = 'trystero' | 'gun'

interface CreateTransportOptions {
  roomId: string
  mode?: TransportMode
  /**
   * P2P providers to use in parallel.
   * If not specified, defaults to ['trystero'].
   * Example: ['trystero', 'gun'] to run both in parallel.
   */
  providers?: P2PProvider[]
}

export async function createTransport(options: CreateTransportOptions): Promise<SignalingTransport> {
  const { roomId, mode = 'auto', providers = ['trystero'] } = options
  const logStore = useLogStore()
  const effectiveMode = determineMode(mode)
  
  logStore.info('signaling', `Transport mode: ${effectiveMode}, providers: ${providers.join(', ')}`)
  
  switch (effectiveMode) {
    case 'websocket':
      return createWebSocketTransport(roomId)
    
    case 'p2p': {
      const config = await loadP2PConfig()
      
      // Create message transports for each provider
      const transports: MessageTransport[] = []
      
      for (const provider of providers) {
        switch (provider) {
          case 'trystero': {
            logStore.info('transport', `Creating Trystero transport`)
            const trysteroTransport = createTrysteroTransport({ roomId, config })
            transports.push(trysteroTransport)
            break
          }
          case 'gun': {
            // Check if Gun is enabled in config
            const gunConfig = config.transports.gun
            if (gunConfig?.enabled) {
              logStore.info('transport', `Creating GunJS transport`)
              const gunTransport = createGunJSTransport({ 
                roomId, 
                peers: gunConfig.peers 
              })
              transports.push(gunTransport)
            } else {
              logStore.info('transport', `GunJS transport disabled in config, skipping`)
            }
            break
          }
          default:
            logStore.warn('transport', `Unknown P2P provider: ${provider}`)
        }
      }
      
      if (transports.length === 0) {
        throw new Error('No P2P transports available. Check your configuration.')
      }
      
      // If only one transport, use it directly (no need for combined)
      let messageTransport: MessageTransport
      if (transports.length === 1) {
        const singleTransport = transports[0]
        if (!singleTransport) {
          throw new Error('Failed to create transport')
        }
        messageTransport = singleTransport
      } else {
        // Multiple transports - merge them
        logStore.info('transport', `Combining ${transports.length} transports in parallel`)
        messageTransport = createCombinedTransport(transports)
      }
      
      return createP2PSignalingProtocol(messageTransport, {
        resendIntervalMs: config.signaling.resendIntervalMs,
        resendMaxAttempts: config.signaling.resendMaxAttempts
      })
    }
    
    default:
      throw new Error(`Unknown transport mode: ${effectiveMode}`)
  }
}

function determineMode(requestedMode: TransportMode): 'websocket' | 'p2p' {
  if (requestedMode === 'websocket') return 'websocket'
  if (requestedMode === 'p2p') return 'p2p'
  
  // Auto-detect based on server-injected config
  if (typeof window !== 'undefined' && (window as unknown as { __CONFIG__?: unknown }).__CONFIG__) {
    console.log('[TransportFactory] Auto-detected: server-hosted mode')
    return 'websocket'
  }
  
  console.log('[TransportFactory] Auto-detected: P2P mode')
  return 'p2p'
}

export function createWebSocketTransportSync(roomId: string): SignalingTransport {
  return createWebSocketTransport(roomId)
}
