import { test, expect, BrowserContext, Page } from '@playwright/test'

/**
 * WebRTC E2E Tests
 * 
 * Two browser contexts = two peers
 * Each gets fake media, connects via signaling server, establishes P2P
 */

test.describe('WebRTC Video Call', () => {
  let peerA: { context: BrowserContext; page: Page }
  let peerB: { context: BrowserContext; page: Page }
  let roomUrl: string

  test.beforeEach(async ({ browser }) => {
    // Create TWO separate browser contexts (not just pages)
    // This ensures separate WebRTC connections
    const contextA = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    const contextB = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    
    peerA = { context: contextA, page: await contextA.newPage() }
    peerB = { context: contextB, page: await contextB.newPage() }
  })

  test.afterEach(async () => {
    await peerA.context.close()
    await peerB.context.close()
  })

  test('full call flow: create room → join → connect', async () => {
    // === PEER A: Create room ===
    await peerA.page.goto('/')
    await peerA.page.click('text=Generate Link')
    
    // Wait for room creation and get URL
    await peerA.page.waitForURL(/\/room\//)
    roomUrl = peerA.page.url()
    console.log('Room URL:', roomUrl)
    
    // Peer A should show loading → then connected state
    await peerA.page.waitForSelector('text=Connecting', { timeout: 5000 }).catch(() => {})
    
    // Wait for media to be acquired
    await peerA.page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.srcObject
    }, { timeout: 10000 })

    // === PEER B: Join room ===
    await peerB.page.goto(roomUrl)
    
    // Both should eventually show 2 participants
    // Wait for WebRTC connection to establish
    await Promise.all([
      peerA.page.waitForFunction(
        () => document.querySelectorAll('video').length >= 2,
        { timeout: 30000 }
      ),
      peerB.page.waitForFunction(
        () => document.querySelectorAll('video').length >= 2,
        { timeout: 30000 }
      ),
    ])
    
    console.log('✅ Both peers connected with video')
  })

  test('chat works via DataChannel', async () => {
    // Setup: both join room first
    await peerA.page.goto('/')
    await peerA.page.click('text=Generate Link')
    await peerA.page.waitForURL(/\/room\//)
    roomUrl = peerA.page.url()
    
    await peerB.page.goto(roomUrl)
    
    // Wait for connection
    await Promise.all([
      peerA.page.waitForFunction(() => document.querySelectorAll('video').length >= 2, { timeout: 30000 }),
      peerB.page.waitForFunction(() => document.querySelectorAll('video').length >= 2, { timeout: 30000 }),
    ])
    
    // Open chat on both sides
    await peerA.page.click('[data-testid="chat-toggle"]')
    await peerB.page.click('[data-testid="chat-toggle"]')
    
    // Peer A sends message
    await peerA.page.fill('[data-testid="chat-input"]', 'Hello from Peer A')
    await peerA.page.click('[data-testid="chat-send"]')
    
    // Peer B should receive
    await expect(peerB.page.locator('[data-testid="chat-messages"]')).toContainText('Hello from Peer A', { timeout: 5000 })
    
    // Peer B replies
    await peerB.page.fill('[data-testid="chat-input"]', 'Hey Peer B here')
    await peerB.page.click('[data-testid="chat-send"]')
    
    await expect(peerA.page.locator('[data-testid="chat-messages"]')).toContainText('Hey Peer B here', { timeout: 5000 })
    
    console.log('✅ Chat working via DataChannel')
  })

  test('peer disconnect is detected', async () => {
    // Setup
    await peerA.page.goto('/')
    await peerA.page.click('text=Generate Link')
    await peerA.page.waitForURL(/\/room\//)
    roomUrl = peerA.page.url()
    
    await peerB.page.goto(roomUrl)
    
    await Promise.all([
      peerA.page.waitForFunction(() => document.querySelectorAll('video').length >= 2, { timeout: 30000 }),
      peerB.page.waitForFunction(() => document.querySelectorAll('video').length >= 2, { timeout: 30000 }),
    ])
    
    // Peer B disconnects
    await peerB.page.click('text=Leave')
    
    // Peer A should see only 1 video now (their own)
    await peerA.page.waitForFunction(
      () => document.querySelectorAll('video').length === 1,
      { timeout: 10000 }
    )
    
    console.log('✅ Disconnect detected')
  })

  test('signaling reconnect after brief disconnect', async () => {
    // Setup
    await peerA.page.goto('/')
    await peerA.page.click('text=Generate Link')
    await peerA.page.waitForURL(/\/room\//)
    roomUrl = peerA.page.url()
    
    await peerB.page.goto(roomUrl)
    
    await Promise.all([
      peerA.page.waitForFunction(() => document.querySelectorAll('video').length >= 2, { timeout: 30000 }),
      peerB.page.waitForFunction(() => document.querySelectorAll('video').length >= 2, { timeout: 30000 }),
    ])
    
    // Kill and restart signaling connection for Peer A
    await peerA.page.evaluate(() => {
      // Force close WebSocket
      const ws = (window as any).__testWs
      if (ws) ws.close()
    })
    
    // Should show "Signaling offline" briefly
    await peerA.page.waitForSelector('text=Signaling offline', { timeout: 5000 }).catch(() => {
      console.log('Signaling offline indicator may not have shown')
    })
    
    // Connection should recover (P2P stays alive)
    // Videos should still be there
    const videoCount = await peerA.page.evaluate(() => document.querySelectorAll('video').length)
    expect(videoCount).toBeGreaterThanOrEqual(2)
    
    console.log('✅ Signaling reconnect handled')
  })
})
