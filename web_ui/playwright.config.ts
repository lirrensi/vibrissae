import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E testing for WebRTC video chat
 * 
 * RUN: 
 *   1. Start server: cd server && go run .
 *   2. Run tests: cd web_ui && npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000, // WebRTC needs time
  expect: {
    timeout: 10000,
  },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // MUST be 1 - WebRTC tests share server state
  reporter: 'list', // Better for local dev
  
  use: {
    actionTimeout: 0,
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    headless: false, // See what's happening locally
    video: 'on', // Capture video for debugging
    permissions: ['camera', 'microphone'],
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',  // Fake webcam/mic
            '--use-fake-ui-for-media-stream',      // Auto-grant permissions
            '--auto-accept-camera-and-microphone-capture',
          ],
        },
      },
    },
  ],
})
