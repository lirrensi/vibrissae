import { useLogStore } from '@/stores/log'
import type { P2PConfig, TorrentConfig, NostrConfig, MQTTConfig, IPFSConfig } from '@/types/p2p-config'

// Fallback defaults (used when external config not found)
const defaultConfig: P2PConfig = {
  version: 1,
  transports: {
    priority: ['nostr', 'torrent', 'mqtt', 'ipfs'],
    torrent: {
      enabled: true,
      announce: ['wss://tracker.openwebtorrent.com', 'wss://tracker.webtorrent.dev']
    },
    nostr: {
      enabled: true,
      relays: ['wss://relay.damus.io', 'wss://nostr.mom']
    },
    mqtt: {
      enabled: true
    },
    ipfs: {
      enabled: true
    }
  },
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ],
  signaling: {
    resendIntervalMs: 3000,
    resendMaxAttempts: 10
  }
}

// Cache for loaded config
let _cachedConfig: P2PConfig | null = null

// Reset cache (useful for testing)
export function resetP2PConfigCache(): void {
  _cachedConfig = null
}

// Build constants - injected at compile time by Vite
declare const __BUILD_MODE__: string
// In single mode, __P2P_CONFIG__ is the config object (Vite define replaces it directly)
declare const __P2P_CONFIG__: P2PConfig | null

export async function loadP2PConfig(): Promise<P2PConfig> {
  // Return cached config if available
  if (_cachedConfig) {
    return _cachedConfig
  }

  const logStore = useLogStore()
  let config: P2PConfig

  // SINGLE MODE: Config is embedded in the bundle at build time
  // NO network fetch - guaranteed to work on GitHub Pages
  if (__BUILD_MODE__ === 'single' && __P2P_CONFIG__) {
    logStore.info('signaling', 'Single-file mode: using embedded P2P config')
    config = mergeWithDefaults(__P2P_CONFIG__ as Partial<P2PConfig>)
  } else {
    // P2P mode: fetch external config with aggressive cache-busting
    const cacheBuster = `?v=${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const response = await fetch(`/p2p-config.json${cacheBuster}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })

      if (response.ok) {
        const loadedConfig = (await response.json()) as Partial<P2PConfig>
        logStore.info('signaling', 'P2P config loaded from external file')
        config = mergeWithDefaults(loadedConfig)
      } else {
        config = defaultConfig
      }
    } catch {
      logStore.info('signaling', 'External P2P config not found, using default')
      config = defaultConfig
    }
  }

  // Cache the config
  _cachedConfig = config
  return config
}

// Get ICE servers from loaded config
export async function getIceServers(): Promise<RTCIceServer[]> {
  const config = await loadP2PConfig()
  return config.iceServers ?? defaultConfig.iceServers ?? []
}

function mergeWithDefaults(config: Partial<P2PConfig>): P2PConfig {
  const tc = config.transports?.torrent
  const nc = config.transports?.nostr
  const mc = config.transports?.mqtt
  const ic = config.transports?.ipfs

  return {
    version: config.version ?? defaultConfig.version,
    transports: {
      priority: config.transports?.priority ?? defaultConfig.transports.priority,
      torrent: {
        enabled: tc?.enabled ?? defaultConfig.transports.torrent!.enabled,
        announce: tc?.announce ?? defaultConfig.transports.torrent!.announce
      } as TorrentConfig,
      nostr: {
        enabled: nc?.enabled ?? defaultConfig.transports.nostr!.enabled,
        relays: nc?.relays ?? defaultConfig.transports.nostr!.relays
      } as NostrConfig,
      mqtt: {
        enabled: mc?.enabled ?? true,
        url: mc?.url
      } as MQTTConfig,
      ipfs: {
        enabled: ic?.enabled ?? true,
        bootstrap: ic?.bootstrap
      } as IPFSConfig
    },
    iceServers: config.iceServers ?? defaultConfig.iceServers,
    signaling: {
      resendIntervalMs:
        config.signaling?.resendIntervalMs ?? defaultConfig.signaling.resendIntervalMs,
      resendMaxAttempts:
        config.signaling?.resendMaxAttempts ?? defaultConfig.signaling.resendMaxAttempts
    }
  }
}