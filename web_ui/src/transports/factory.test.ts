import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTransport, createWebSocketTransportSync } from './factory'

// Mock dependencies
vi.mock('@/stores/log', () => ({
  useLogStore: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('./WebSocketTransport', () => ({
  createWebSocketTransport: vi.fn(() => ({
    connected: { value: false },
    participantId: { value: 'mock-peer-id' },
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn()
  }))
}))

vi.mock('./TrysteroTransport', () => ({
  createTrysteroTransport: vi.fn(() => ({
    connected: { value: false },
    participantId: { value: 'mock-peer-id' },
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn()
  }))
}))

vi.mock('@/utils/p2p-config-loader', () => ({
  loadP2PConfig: vi.fn().mockResolvedValue({
    version: 1,
    transports: {
      priority: ['torrent', 'nostr'],
      torrent: { enabled: true, announce: [] },
      nostr: { enabled: true, relays: [] }
    },
    signaling: { resendIntervalMs: 3000, resendMaxAttempts: 10 }
  })
}))

describe('transport factory', () => {
  let originalWindow: typeof globalThis.window

  beforeEach(() => {
    originalWindow = global.window
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore window
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true
    })
  })

  describe('createTransport', () => {
    it('should create websocket transport when mode is explicitly websocket', async () => {
      const { createWebSocketTransport } = await import('./WebSocketTransport')
      
      await createTransport({ roomId: 'test-room', mode: 'websocket' })

      expect(createWebSocketTransport).toHaveBeenCalledWith('test-room')
    })

    it('should create p2p transport when mode is explicitly p2p', async () => {
      const { createTrysteroTransport } = await import('./TrysteroTransport')
      const { loadP2PConfig } = await import('@/utils/p2p-config-loader')
      
      await createTransport({ roomId: 'test-room', mode: 'p2p' })

      expect(createTrysteroTransport).toHaveBeenCalledWith({
        roomId: 'test-room',
        config: expect.any(Object)
      })
      expect(loadP2PConfig).toHaveBeenCalled()
    })

    it('should auto-detect websocket mode when window.__CONFIG__ exists', async () => {
      const { createWebSocketTransport } = await import('./WebSocketTransport')
      
      // Mock window.__CONFIG__ exists
      vi.stubGlobal('window', {
        __CONFIG__: { baseUrl: 'https://example.com' }
      } as any)

      await createTransport({ roomId: 'test-room', mode: 'auto' })

      expect(createWebSocketTransport).toHaveBeenCalledWith('test-room')
    })

    it('should auto-detect p2p mode when window.__CONFIG__ does not exist', async () => {
      const { createTrysteroTransport } = await import('./TrysteroTransport')
      
      // Mock window.__CONFIG__ does not exist
      vi.stubGlobal('window', {
        __CONFIG__: undefined
      } as any)

      await createTransport({ roomId: 'test-room', mode: 'auto' })

      expect(createTrysteroTransport).toHaveBeenCalled()
    })

    it('should handle undefined window gracefully in SSR context', async () => {
      const { createTrysteroTransport } = await import('./TrysteroTransport')
      
      // Replace window with undefined (simulating SSR where it's not defined)
      const originalWindowDesc = Object.getOwnPropertyDescriptor(global, 'window')
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true,
        configurable: true
      })

      await createTransport({ roomId: 'test-room', mode: 'auto' })

      expect(createTrysteroTransport).toHaveBeenCalled()

      // Restore window
      if (originalWindowDesc) {
        Object.defineProperty(global, 'window', originalWindowDesc)
      }
    })

    it('should create transport without throwing', async () => {
      // Just verify it doesn't throw with explicit mode
      await expect(
        createTransport({ roomId: 'test-room', mode: 'websocket' })
      ).resolves.toBeDefined()
    })
  })

  describe('createWebSocketTransportSync', () => {
    it('should create websocket transport synchronously', async () => {
      const { createWebSocketTransport } = await import('./WebSocketTransport')
      
      createWebSocketTransportSync('test-room')

      expect(createWebSocketTransport).toHaveBeenCalledWith('test-room')
    })
  })

  // Note: Mode determination tests already covered in createTransport describe block
})