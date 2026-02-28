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
  signaling: {
    resendIntervalMs: 3000,
    resendMaxAttempts: 10
  }
}

export async function loadP2PConfig(): Promise<P2PConfig> {
  const logStore = useLogStore()

  // In single-file mode, import the bundled config (inlined at build time)
  if (typeof __BUILD_MODE__ !== 'undefined' && __BUILD_MODE__ === 'single') {
    const bundledConfig = await import('../../public/p2p-config.json')
    logStore.info('signaling', 'Single-file mode: using bundled P2P config')
    return mergeWithDefaults(bundledConfig as Partial<P2PConfig>)
  }

  // In normal P2P mode, fetch external config
  try {
    const response = await fetch('/p2p-config.json', {
      cache: 'no-cache'
    })

    if (response.ok) {
      const config = (await response.json()) as Partial<P2PConfig>
      logStore.info('signaling', 'P2P config loaded from external file')
      return mergeWithDefaults(config)
    }
  } catch {
    logStore.info('signaling', 'External P2P config not found, using default')
  }

  return defaultConfig
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
    signaling: {
      resendIntervalMs:
        config.signaling?.resendIntervalMs ?? defaultConfig.signaling.resendIntervalMs,
      resendMaxAttempts:
        config.signaling?.resendMaxAttempts ?? defaultConfig.signaling.resendMaxAttempts
    }
  }
}