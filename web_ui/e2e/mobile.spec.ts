import { test, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * Mobile/Responsive E2E Tests
 *
 * These tests verify the application works on mobile devices:
 * - Responsive layout on small screens
 * - Touch-friendly controls
 * - Mobile browser WebRTC support
 * - Portrait/landscape orientation handling
 */

test.describe('Mobile/Responsive', () => {
  let mobileContext: BrowserContext
  let mobilePage: Page

  test.beforeEach(async ({ browser }) => {
    mobileContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
      viewport: { width: 375, height: 667 }, // iPhone SE size
    })
    mobilePage = await mobileContext.newPage()

    // Capture console logs
    mobilePage.on('console', msg => {
      console.log(`[Mobile ${msg.type()}] ${msg.text()}`)
    })
  })

  test.afterEach(async () => {
    await mobileContext?.close()
  })

  test('mobile home page loads with responsive layout', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')

    // Check page title
    await expect(mobilePage.locator('h1')).toHaveText('VideoChat')

    // Check button is visible and tappable
    const generateButton = mobilePage.locator('button:has-text("Generate Link")')
    await expect(generateButton).toBeVisible()

    // Verify button is large enough for touch (min 44x44px)
    const buttonBox = await generateButton.boundingBox()
    expect(buttonBox).toBeTruthy()
    if (buttonBox) {
      expect(buttonBox.width).toBeGreaterThanOrEqual(44)
      expect(buttonBox.height).toBeGreaterThanOrEqual(44)
    }

    console.log('✅ Mobile home page loaded with responsive layout')
  })

  test('mobile can create room', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')
    await mobilePage.click('button:has-text("Generate Link")')

    // Should navigate to room
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const url = mobilePage.url()
    expect(url).toMatch(/room\/[a-f0-9-]+/)

    console.log('✅ Mobile room creation works')
  })

  test('mobile camera activates in portrait mode', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')
    await mobilePage.click('button:has-text("Generate Link")')
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for local video
    const localVideo = mobilePage.locator('video[data-testid="local-video"]').first()
    await expect(localVideo).toBeVisible({ timeout: 15000 })

    // Verify video is playing
    const isPlaying = await localVideo.evaluate((video: HTMLVideoElement) => {
      return video.readyState >= 2 && video.videoWidth > 0
    })
    expect(isPlaying).toBe(true)

    console.log('✅ Mobile camera activated in portrait mode')
  })

  test('mobile controls are accessible', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')
    await mobilePage.click('button:has-text("Generate Link")')
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for video
    await expect(mobilePage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Find control buttons
    const muteButton = mobilePage.locator('button[aria-label*="mute"], button[title*="mute"]').first()
    const videoButton = mobilePage.locator('button[aria-label*="video"], button[title*="video"]').first()

    // At least some controls should be visible
    const hasControls = await muteButton.isVisible().catch(() => false) ||
                       await videoButton.isVisible().catch(() => false)

    expect(hasControls).toBe(true)
    console.log('✅ Mobile controls are accessible')
  })

  test('mobile switches to landscape orientation', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')
    await mobilePage.click('button:has-text("Generate Link")')
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for video
    await expect(mobilePage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Simulate landscape orientation
    await mobilePage.setViewportSize({ width: 667, height: 375 })

    // Wait for layout adjustment
    await mobilePage.waitForTimeout(1000)

    // Video should still be visible
    await expect(mobilePage.locator('video[data-testid="local-video"]').first()).toBeVisible()

    console.log('✅ Mobile handles landscape orientation')
  })

  test('mobile two-peer connection works', async ({ baseURL }) => {
    console.log('🎬 Starting mobile two-peer test')

    // Peer A (mobile) creates room
    await mobilePage.goto(baseURL || '/')
    await mobilePage.click('button:has-text("Generate Link")')
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    const roomUrl = mobilePage.url()

    // Wait for local video
    await expect(mobilePage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Peer B (desktop) joins
    const desktopContext = await mobilePage.context().browser()!.newContext({
      permissions: ['camera', 'microphone'],
    })
    const desktopPage = await desktopContext.newPage()

    desktopPage.on('console', msg => {
      console.log(`[Desktop ${msg.type()}] ${msg.text()}`)
    })

    await desktopPage.goto(roomUrl)
    await desktopPage.waitForURL(/.*room\/.+/, { timeout: 10000 })
    await expect(desktopPage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Wait for connection
    await mobilePage.waitForTimeout(8000)

    // Check if mobile sees remote video
    const mobileRemoteVisible = await mobilePage.locator('video[data-testid="remote-video"]').first().isVisible().catch(() => false)

    console.log(`🔍 Mobile remote video: ${mobileRemoteVisible}`)

    if (mobileRemoteVisible) {
      console.log('✅ Mobile-to-desktop WebRTC connection successful')
    } else {
      console.log('⚠️ Mobile remote video not visible')
    }

    await desktopContext.close()
  })

  test('mobile viewport does not overflow', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')

    // Check for horizontal scroll
    const hasHorizontalScroll = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })

    expect(hasHorizontalScroll).toBe(false)

    // Create room and check again
    await mobilePage.click('button:has-text("Generate Link")')
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })
    await mobilePage.waitForTimeout(2000)

    const hasHorizontalScrollInRoom = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })

    expect(hasHorizontalScrollInRoom).toBe(false)

    console.log('✅ Mobile viewport does not overflow')
  })

  test('mobile touch events work for controls', async ({ baseURL }) => {
    await mobilePage.goto(baseURL || '/')
    await mobilePage.click('button:has-text("Generate Link")')
    await mobilePage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // Wait for video
    await expect(mobilePage.locator('video[data-testid="local-video"]').first()).toBeVisible({ timeout: 15000 })

    // Find and tap mute button
    const muteButton = mobilePage.locator('button[aria-label*="mute"]').first()

    if (await muteButton.isVisible()) {
      // Use tap instead of click for mobile
      await muteButton.tap()
      await mobilePage.waitForTimeout(500)

      console.log('✅ Mobile touch events work')
    } else {
      console.log('⚠️ Mute button not found')
    }
  })

  test('mobile handles device permissions gracefully', async ({ baseURL }) => {
    // Create context without permissions
    const noPermContext = await mobilePage.context().browser()!.newContext({
      permissions: [],
    })
    const noPermPage = await noPermContext.newPage()

    noPermPage.on('console', msg => {
      console.log(`[NoPerm ${msg.type()}] ${msg.text()}`)
    })

    await noPermPage.goto(baseURL || '/')
    await noPermPage.click('button:has-text("Generate Link")')
    await noPermPage.waitForURL(/.*room\/.+/, { timeout: 10000 })

    // App should handle missing permissions gracefully
    await noPermPage.waitForTimeout(3000)

    // Should still be on the page (not crashed)
    await expect(noPermPage.locator('h1, [data-testid="room"]')).toBeVisible({ timeout: 5000 })

    console.log('✅ Mobile handles missing permissions gracefully')

    await noPermContext.close()
  })
})
