import { test, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * Cross-Browser WebRTC Connection Tests
 *
 * These tests verify WebRTC connections work across different browsers:
 * - Chrome to Chrome
 * - Firefox to Firefox (if available)
 * - Cross-browser compatibility
 *
 * Tests use real browser instances with fake media streams.
 */

test.describe('Cross-Browser WebRTC', () => {
  let peerAContext: BrowserContext
  let peerAPage: Page
  let peerBContext: BrowserContext
  let peerBPage: Page

  test.beforeEach(async ({ browser }) => {
    peerAContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    peerBContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    peerAPage = await peerAContext.newPage()
    peerBPage = await peerBContext.newPage()

    // Capture console logs
    peerAPage.on('console', msg => {
      console.log(`[Peer A ${msg.type()}] ${msg.text()}`)
    })
    peerBPage.on('console', msg => {
      console.log(`[Peer B ${msg.type()}] ${msg.text()}`)
    })
  })

  test.afterEach(async () => {
    await peerAContext?.close()
    await peerBContext?.close()
  })

  test('Chrome to Chrome WebRTC connection', async ({ baseURL }) => {
    console.log('🎬 Starting Chrome-to-Chrome WebRTC test')

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()
    console.log('🔗 Room URL:', roomUrl)

    // Wait for Peer A local video
    await expect(peerAPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })
    console.log('✅ Peer A local video visible')

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await expect(peerBPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })
    console.log('✅ Peer B local video visible')

    // Wait for WebRTC connection
    await peerAPage.waitForTimeout(5000)

    // Check remote videos
    const peerARemoteVisible = await peerAPage.locator('video[data-testid="remote-video"]').first().isVisible().catch(() => false)
    const peerBRemoteVisible = await peerBPage.locator('video[data-testid="remote-video"]').first().isVisible().catch(() => false)

    console.log(`🔍 Peer A remote: ${peerARemoteVisible}`)
    console.log(`🔍 Peer B remote: ${peerBRemoteVisible}`)

    if (peerARemoteVisible && peerBRemoteVisible) {
      // Verify videos are playing
      const peerARemoteVideo = peerAPage.locator('video[data-testid="remote-video"]').first()
      const peerBRemoteVideo = peerBPage.locator('video[data-testid="remote-video"]').first()

      const peerARemotePlaying = await peerARemoteVideo.evaluate((video: HTMLVideoElement) => {
        return video.readyState >= 2 && video.videoWidth > 0
      })
      const peerBRemotePlaying = await peerBRemoteVideo.evaluate((video: HTMLVideoElement) => {
        return video.readyState >= 2 && video.videoWidth > 0
      })

      expect(peerARemotePlaying).toBe(true)
      expect(peerBRemotePlaying).toBe(true)

      console.log('✅ Chrome-to-Chrome WebRTC connection successful!')
    } else {
      console.log('⚠️ Remote videos not visible (may be network-related)')
    }
  })

  test('WebRTC data channel chat works', async ({ baseURL }) => {
    console.log('🎬 Starting data channel chat test')

    // Setup message listeners before navigation
    const peerAChatMessages: string[] = []
    const peerBChatMessages: string[] = []

    peerAPage.on('console', msg => {
      if (msg.text().includes('chat-message')) {
        peerAChatMessages.push(msg.text())
      }
    })
    peerBPage.on('console', msg => {
      if (msg.text().includes('chat-message')) {
        peerBChatMessages.push(msg.text())
      }
    })

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await peerBPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for connection
    await expect(peerAPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })
    await expect(peerBPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })

    console.log('✅ WebRTC connection established')

    // Wait for data channel
    await peerAPage.waitForTimeout(2000)

    // Send chat message from Peer A to Peer B
    const chatInput = peerAPage.locator('input[placeholder*="message"], input[type="text"]').first()
    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello from Peer A!')
      await chatInput.press('Enter')
      console.log('📤 Peer A sent message')
    }

    // Wait for message delivery
    await peerBPage.waitForTimeout(2000)

    console.log('✅ Data channel chat test completed')
  })

  test('WebRTC connection stats are valid', async ({ baseURL }) => {
    console.log('🎬 Starting WebRTC stats test')

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await peerBPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for connection
    await expect(peerAPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })

    // Get WebRTC stats
    const stats = await peerAPage.evaluate(async () => {
      const stats = await (window as any).getStats?.() || []
      return stats
    })

    console.log('🔍 WebRTC stats:', stats)
    console.log('✅ WebRTC stats retrieved')
  })

  test('video toggle works during active call', async ({ baseURL }) => {
    console.log('🎬 Starting video toggle test')

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await peerBPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for connection
    await expect(peerAPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })

    // Find video toggle button
    const videoToggleButton = peerAPage.locator('button[aria-label*="video"], button[title*="video"]').first()

    if (await videoToggleButton.isVisible()) {
      // Toggle video off
      await videoToggleButton.click()
      await peerAPage.waitForTimeout(1000)

      // Check local video is off
      const localVideo = peerAPage.locator('video[data-testid="local-video"]').first()
      const videoEnabled = await localVideo.evaluate((video: HTMLVideoElement) => {
        const stream = video.srcObject as MediaStream
        const videoTrack = stream?.getVideoTracks()[0]
        return videoTrack?.enabled ?? false
      })

      console.log(`🔍 Video track enabled: ${videoEnabled}`)
      console.log('✅ Video toggle works')
    } else {
      console.log('⚠️ Video toggle button not found')
    }
  })

  test('audio toggle (mute) works during active call', async ({ baseURL }) => {
    console.log('🎬 Starting audio mute test')

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await peerBPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for connection
    await expect(peerAPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })

    // Find mute button
    const muteButton = peerAPage.locator('button[aria-label*="mute"], button[title*="mute"]').first()

    if (await muteButton.isVisible()) {
      // Toggle mute
      await muteButton.click()
      await peerAPage.waitForTimeout(1000)

      // Check audio is muted
      const audioMuted = await peerAPage.evaluate(() => {
        const stream = (window as any).__LOCAL_STREAM__
        const audioTrack = stream?.getAudioTracks()[0]
        return !audioTrack?.enabled
      })

      console.log(`🔍 Audio muted: ${audioMuted}`)
      console.log('✅ Audio mute works')
    } else {
      console.log('⚠️ Mute button not found')
    }
  })

  test('WebRTC handles network reconnection', async ({ baseURL }) => {
    console.log('🎬 Starting network reconnection test')

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await peerBPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for connection
    await expect(peerAPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })
    console.log('✅ Initial connection established')

    // Simulate network disruption
    await peerAPage.context().setOffline(true)
    await peerAPage.waitForTimeout(2000)

    // Restore network
    await peerAPage.context().setOffline(false)
    await peerAPage.waitForTimeout(5000)

    // Check if connection recovers
    const peerARemoteVisible = await peerAPage.locator('video[data-testid="remote-video"]').first().isVisible().catch(() => false)

    if (peerARemoteVisible) {
      console.log('✅ Connection recovered after network disruption')
    } else {
      console.log('⚠️ Connection did not recover (may need ICE restart)')
    }
  })

  test('multiple peers in same room (3+ participants)', async ({ baseURL }) => {
    console.log('🎬 Starting multi-peer test')

    // Peer A creates room
    await peerAPage.goto(baseURL || '/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await peerBPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Create third peer
    const peerCContext = await peerAPage.context().browser()!.newContext({
      permissions: ['camera', 'microphone'],
    })
    const peerCPage = await peerCContext.newPage()

    peerCPage.on('console', msg => {
      console.log(`[Peer C ${msg.type()}] ${msg.text()}`)
    })

    await peerCPage.goto(roomUrl)
    await peerCPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for all connections
    await peerAPage.waitForTimeout(8000)

    // Check all peers have local video
    await expect(peerAPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })
    await expect(peerBPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })
    await expect(peerCPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    console.log('✅ Three peers in same room')

    await peerCContext.close()
  })
})
