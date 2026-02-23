import { test, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * VideoChat E2E Tests - Full WebRTC testing with camera/mic
 * Tests complete P2P connection flow with real media streams
 */

test.describe('VideoChat E2E', () => {
  let peerAContext: BrowserContext
  let peerAPage: Page
  let peerBContext: BrowserContext
  let peerBPage: Page

  test.beforeEach(async ({ browser }) => {
    // Create contexts with camera/mic permissions granted
    peerAContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    peerBContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    peerAPage = await peerAContext.newPage()
    peerBPage = await peerBContext.newPage()

    // Capture ALL console logs for debugging
    peerAPage.on('console', msg => {
      console.log(`[Peer A ${msg.type()}]`, msg.text())
    })
    peerBPage.on('console', msg => {
      console.log(`[Peer B ${msg.type()}]`, msg.text())
    })
  })

  test.afterEach(async () => {
    await peerAContext?.close()
    await peerBContext?.close()
  })

  test('home page loads and can create room', async () => {
    await peerAPage.goto('/')

    // Check page title
    await expect(peerAPage.locator('h1')).toHaveText('VideoChat')

    // Check button exists
    await expect(peerAPage.locator('button:has-text("Generate Link")')).toBeVisible()

    // Click to create room
    await peerAPage.click('button:has-text("Generate Link")')

    // Should navigate to room
    await peerAPage.waitForURL(/\/room\//, { timeout: 10000 })

    const url = peerAPage.url()
    expect(url).toMatch(/\/room\/[a-f0-9-]+/)

    console.log('✅ Room created:', url)
  })

  test('camera activates and local video appears', async () => {
    await peerAPage.goto('/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/\/room\//, { timeout: 10000 })

    // Wait for local video to appear (camera activated)
    const localVideo = peerAPage.locator('video[data-testid="local-video"]').first()
    await expect(localVideo).toBeVisible({ timeout: 15000 })

    // Verify video is actually playing (has video tracks)
    const isPlaying = await localVideo.evaluate((video: HTMLVideoElement) => {
      return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
    })
    expect(isPlaying).toBe(true)

    console.log('✅ Local camera activated and video playing')
  })

  test('second peer can join room and both see local video', async () => {
    // Peer A creates room
    await peerAPage.goto('/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/\/room\//, { timeout: 10000 })

    const roomUrl = peerAPage.url()
    console.log('Room URL:', roomUrl)

    // Wait for Peer A local video
    const peerALocalVideo = peerAPage.locator('video[data-testid="local-video"]').first()
    await expect(peerALocalVideo).toBeVisible({ timeout: 15000 })

    // Peer B joins
    await peerBPage.goto(roomUrl)

    // Wait for Peer B local video
    const peerBLocalVideo = peerBPage.locator('video[data-testid="local-video"]').first()
    await expect(peerBLocalVideo).toBeVisible({ timeout: 15000 })

    console.log('✅ Both peers in room with local video active')
  })

  test('peers establish WebRTC connection and see remote video', async () => {
    // Peer A creates room
    console.log('🎬 Starting WebRTC connection test')
    await peerAPage.goto('/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/\/room\//, { timeout: 10000 })

    const roomUrl = peerAPage.url()
    console.log('🔗 Room URL:', roomUrl)

    // Wait for Peer A local video (camera active)
    await expect(peerAPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })
    console.log('✅ Peer A local video visible')

    // Wait for signaling to be connected
    await peerAPage.waitForFunction(() => {
      const status = document.querySelector('[data-testid="connection-status"]')
      return status?.textContent?.includes('Signaling')
    }, { timeout: 10000 })
    console.log('✅ Peer A signaling connected')

    // Peer B joins
    console.log('👤 Peer B joining...')
    await peerBPage.goto(roomUrl)
    await expect(peerBPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })
    console.log('✅ Peer B local video visible')

    // Wait for signaling on Peer B
    await peerBPage.waitForFunction(() => {
      const status = document.querySelector('[data-testid="connection-status"]')
      return status?.textContent?.includes('Signaling')
    }, { timeout: 10000 })
    console.log('✅ Peer B signaling connected')

    // Wait for peers to discover each other and establish connection
    console.log('⏳ Waiting for WebRTC connection...')
    await peerAPage.waitForTimeout(5000)

    // Debug: check participant count
    const peerAParticipants = await peerAPage.evaluate(() => {
      const status = document.querySelector('[data-testid="connection-status"]')
      return status?.textContent
    })
    const peerBParticipants = await peerBPage.evaluate(() => {
      const status = document.querySelector('[data-testid="connection-status"]')
      return status?.textContent
    })
    console.log('🔍 Peer A status:', peerAParticipants)
    console.log('🔍 Peer B status:', peerBParticipants)

    // Debug: count video elements
    const peerAVideoCount = await peerAPage.locator('video').count()
    const peerBVideoCount = await peerBPage.locator('video').count()
    console.log(`🔍 Peer A video count: ${peerAVideoCount}`)
    console.log(`🔍 Peer B video count: ${peerBVideoCount}`)

    // Wait for remote videos (connection established) - with retry
    let attempts = 0
    const maxAttempts = 60 // 60 * 500ms = 30 seconds
    let peerARemoteVisible = false
    let peerBRemoteVisible = false

    while (attempts < maxAttempts && (!peerARemoteVisible || !peerBRemoteVisible)) {
      if (!peerARemoteVisible) {
        peerARemoteVisible = await peerAPage.locator('video[data-testid="remote-video"]').first().isVisible().catch(() => false)
      }
      if (!peerBRemoteVisible) {
        peerBRemoteVisible = await peerBPage.locator('video[data-testid="remote-video"]').first().isVisible().catch(() => false)
      }
      if (!peerARemoteVisible || !peerBRemoteVisible) {
        await peerAPage.waitForTimeout(500)
        attempts++
      }
    }

    console.log(`🔍 Peer A remote video visible: ${peerARemoteVisible} (after ${attempts} attempts)`)
    console.log(`🔍 Peer B remote video visible: ${peerBRemoteVisible} (after ${attempts} attempts)`)

    expect(peerARemoteVisible).toBe(true)
    expect(peerBRemoteVisible).toBe(true)

    // Verify remote videos are actually playing
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

    console.log('✅ WebRTC connection established, both peers see remote video')
  })

  test('connection status shows connected for both peers', async () => {
    // Peer A creates room
    await peerAPage.goto('/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/\/room\//, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Wait for Peer A local video
    await expect(peerAPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Peer B joins
    await peerBPage.goto(roomUrl)
    await expect(peerBPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Wait for remote videos (connection established)
    await expect(peerAPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })
    await expect(peerBPage.locator('video[data-testid="remote-video"]').first()).toBeVisible({ timeout: 30000 })

    // Check connection status indicators if they exist
    const peerAStatus = peerAPage.locator('[data-testid="connection-status"]').first()
    const peerBStatus = peerBPage.locator('[data-testid="connection-status"]').first()

    // Verify signaling is connected (green dot visible)
    if (await peerAStatus.isVisible().catch(() => false)) {
      const statusText = await peerAStatus.textContent()
      // Status shows "Signaling" with a colored dot (green when connected)
      expect(statusText?.toLowerCase()).toContain('signaling')
    }
    if (await peerBStatus.isVisible().catch(() => false)) {
      const statusText = await peerBStatus.textContent()
      expect(statusText?.toLowerCase()).toContain('signaling')
    }

    console.log('✅ Connection status verified for both peers')
  })

  test('peer can leave room and rejoin', async () => {
    // Peer A creates room
    await peerAPage.goto('/')
    await peerAPage.click('button:has-text("Generate Link")')
    await peerAPage.waitForURL(/\/room\//, { timeout: 10000 })

    const roomUrl = peerAPage.url()

    // Wait for camera
    await expect(peerAPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Navigate back to home
    await peerAPage.goto('/')
    await expect(peerAPage).toHaveURL('/')

    // Rejoin the same room
    await peerAPage.goto(roomUrl)
    await expect(peerAPage).toHaveURL(/\/room\//)

    // Camera should activate again
    await expect(peerAPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    console.log('✅ Peer can leave and rejoin room')
  })

  test('server health check', async ({ request }) => {
    const response = await request.get('/health')
    expect(response.status()).toBe(200)
    expect(await response.text()).toBe('OK')

    console.log('✅ Server health check passed')
  })

  test('server stats endpoint works', async ({ request }) => {
    const response = await request.get('/stats')
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('rooms')
    expect(data).toHaveProperty('turnServer')

    console.log('✅ Server stats:', data)
  })
})
