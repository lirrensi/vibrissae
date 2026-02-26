export interface P2PConfig {
  version: number
  transports: {
    priority: TransportType[]
    torrent?: TorrentConfig
    nostr?: NostrConfig
    gun?: GunConfig
    ipfs?: IPFSConfig
    mqtt?: MQTTConfig
  }
  signaling: {
    resendIntervalMs: number
    resendMaxAttempts: number
  }
}

export type TransportType = 'torrent' | 'nostr' | 'gun' | 'ipfs' | 'mqtt'

export interface TorrentConfig {
  enabled: boolean
  announce?: string[]
}

export interface NostrConfig {
  enabled: boolean
  relays?: string[]
}

export interface GunConfig {
  enabled: boolean
  peers?: string[]
}

export interface IPFSConfig {
  enabled: boolean
  bootstrap?: string[]
}

export interface MQTTConfig {
  enabled: boolean
  url?: string
}