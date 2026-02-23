export interface AppConfig {
  baseUrl: string
  turn?: {
    enabled: boolean
    port: number
  }
  turnCredentials?: {
    username: string
    password: string
  }
  turnServers?: TurnServer[]
  stunServers?: string[]
}

export interface TurnServer {
  urls: string
  username?: string
  credential?: string
}

declare global {
  interface Window {
    __CONFIG__: AppConfig | null
  }
}
