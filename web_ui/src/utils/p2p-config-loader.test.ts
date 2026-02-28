import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadP2PConfig } from './p2p-config-loader'

// Mock the log store
vi.mock('@/stores/log', () => ({
  useLogStore: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('p2p-config-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadP2PConfig', () => {
    it('should load default config when external config does not exist', async () => {
      // Mock fetch to throw (network error)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network Error')))

      const config = await loadP2PConfig()

      expect(config.version).toBe(1)
      expect(config.transports.priority).toEqual(['nostr', 'torrent', 'mqtt', 'ipfs'])
      expect(config.transports.torrent?.enabled).toBe(true)
      expect(config.transports.nostr?.enabled).toBe(true)
      expect(config.signaling.resendIntervalMs).toBe(3000)
      expect(config.signaling.resendMaxAttempts).toBe(10)

      vi.unstubAllGlobals()
    })

    it('should load external config when available', async () => {
      const mockConfig = {
        version: 2,
        transports: {
          priority: ['nostr'],
          torrent: { enabled: false },
          nostr: { enabled: true, relays: ['wss://custom.relay'] }
        },
        signaling: { resendIntervalMs: 5000, resendMaxAttempts: 5 }
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      }))

      const config = await loadP2PConfig()

      // Should merge with defaults
      expect(config.version).toBe(2)
      expect(config.transports.priority).toEqual(['nostr'])
      expect(config.transports.torrent?.enabled).toBe(false)
      expect(config.transports.nostr?.enabled).toBe(true)
      expect(config.transports.nostr?.relays).toEqual(['wss://custom.relay'])
      expect(config.signaling.resendIntervalMs).toBe(5000)
      expect(config.signaling.resendMaxAttempts).toBe(5)

      vi.unstubAllGlobals()
    })

    it('should merge partial external config with defaults', async () => {
      const mockConfig = {
        transports: {
          priority: ['gun'],
          torrent: { enabled: true }
          // nostr not provided - should use default
        }
        // signaling not provided - should use default
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      }))

      const config = await loadP2PConfig()

      expect(config.transports.priority).toEqual(['gun'])
      expect(config.transports.torrent?.enabled).toBe(true)
      // nostr should use default
      expect(config.transports.nostr?.enabled).toBe(true)
      // signaling should use default
      expect(config.signaling.resendIntervalMs).toBe(3000)

      vi.unstubAllGlobals()
    })

    it('should return default config when fetch returns 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      }))

      const config = await loadP2PConfig()

      expect(config.version).toBe(1)
      expect(config.transports.torrent?.enabled).toBe(true)

      vi.unstubAllGlobals()
    })

    it('should handle empty response gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      }))

      const config = await loadP2PConfig()

      // Should have all defaults
      expect(config.version).toBe(1)
      expect(config.transports.priority).toEqual(['nostr', 'torrent', 'mqtt', 'ipfs'])
      expect(config.transports.torrent?.enabled).toBe(true)
      expect(config.signaling.resendIntervalMs).toBe(3000)

      vi.unstubAllGlobals()
    })

    it('should handle malformed JSON gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      }))

      const config = await loadP2PConfig()

      // Should fall back to defaults
      expect(config.version).toBe(1)

      vi.unstubAllGlobals()
    })
  })

  describe('mergeWithDefaults', () => {
    // Test internal merge function via public API
    it('should use default announce URLs when not provided', async () => {
      const mockConfig = {
        transports: {
          torrent: { enabled: true }
          // no announce array
        }
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      }))

      const config = await loadP2PConfig()

      expect(config.transports.torrent?.announce).toEqual([
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.webtorrent.dev'
      ])

      vi.unstubAllGlobals()
    })

    it('should use default relay URLs when not provided', async () => {
      const mockConfig = {
        transports: {
          nostr: { enabled: true }
          // no relays array
        }
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      }))

      const config = await loadP2PConfig()

      expect(config.transports.nostr?.relays).toEqual([
        'wss://relay.damus.io',
        'wss://nostr.mom'
      ])

      vi.unstubAllGlobals()
    })

    it('should handle ipfs and mqtt configs when provided', async () => {
      const mockConfig = {
        transports: {
          priority: ['torrent', 'nostr', 'ipfs', 'mqtt'],
          ipfs: { enabled: true, bootstrap: ['/ip4/127.0.0.1/tcp/4001'] },
          mqtt: { enabled: true, url: 'mqtt://localhost:1883' }
        }
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      }))

      const config = await loadP2PConfig()

      expect(config.transports.ipfs?.enabled).toBe(true)
      expect(config.transports.ipfs?.bootstrap).toEqual(['/ip4/127.0.0.1/tcp/4001'])
      expect(config.transports.mqtt?.enabled).toBe(true)
      expect(config.transports.mqtt?.url).toBe('mqtt://localhost:1883')

      vi.unstubAllGlobals()
    })
  })
})