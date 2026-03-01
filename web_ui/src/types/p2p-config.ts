export interface P2PConfig {
  version: number
  transports: {
    priority: TransportType[]
    torrent?: TorrentConfig
    nostr?: NostrConfig
    mqtt?: MQTTConfig
    ipfs?: IPFSConfig
    gun?: GunConfig
  }
  iceServers?: IceServer[]
  signaling: {
    resendIntervalMs: number
    resendMaxAttempts: number
  }
}

export type TransportType = 'torrent' | 'nostr' | 'mqtt' | 'ipfs' | 'gun'

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

export interface GunConfig {
  enabled: boolean
  peers?: string[]  // Gun relay peers to connect to
}

export interface IceServer {
  urls: string
  username?: string
  credential?: string
}