export interface P2PConfig {
  version: number
  transports: {
    priority: TransportType[]
    torrent?: TorrentConfig
    nostr?: NostrConfig
    mqtt?: MQTTConfig
    ipfs?: IPFSConfig
  }
  signaling: {
    resendIntervalMs: number
    resendMaxAttempts: number
  }
}

export type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs'

export interface TorrentConfig {
  enabled: boolean
  announce?: string[]
}

export interface NostrConfig {
  enabled: boolean
  relays?: string[]
}

export interface MQTTConfig {
  enabled: boolean
  url?: string
}

export interface IPFSConfig {
  enabled: boolean
  bootstrap?: string[]
}