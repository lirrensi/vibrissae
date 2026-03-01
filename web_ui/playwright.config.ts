import { defineConfig, devices } from '@playwright/test'

/**
 * Comprehensive Playwright configuration for VideoChat E2E testing
 *
 * Modes:
 * - Single-file P2P mode (GitHub Pages deployment)
 * - Server mode with WebSocket signaling
 * - P2P mode with Trystero/GunJS signaling
 *
 * All tests use real browsers with fake media streams for WebRTC testing.
 */

// Base configuration shared across all projects
const baseConfig = {
  testDir: './e2e',
  timeout: 120 * 1000, // 2 minutes for P2P connection establishment
  expect: { timeout: 30000 },
  workers: 1, // WebRTC tests need sequential execution
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // Grant camera and microphone permissions
    permissions: ['camera', 'microphone'],
    // Launch options to enable fake media stream for WebRTC testing
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--enable-logging',
        '--v=1',
      ],
    },
  },
}

export default defineConfig({
  ...baseConfig,

  projects: [
    // ============================================
    // Single-File P2P Mode (GitHub Pages)
    // ============================================
    {
      name: 'single-file-p2p-chromium',
      testMatch: /.*single-file\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SINGLE_FILE_URL || 'file://' + process.cwd() + '/dist/index.html',
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },

    // ============================================
    // Server Mode with WebSocket Signaling
    // ============================================
    {
      name: 'server-mode-chromium',
      testMatch: /.*server-mode\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SERVER_MODE_URL || 'http://localhost:28080',
      },
    },
    {
      name: 'server-mode-firefox',
      testMatch: /.*server-mode\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.SERVER_MODE_URL || 'http://localhost:28080',
      },
    },

    // ============================================
    // P2P Mode with Trystero/GunJS Signaling
    // ============================================
    {
      name: 'p2p-mode-chromium',
      testMatch: /.*p2p-mode\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.P2P_MODE_URL || 'http://localhost:8080',
      },
    },
    {
      name: 'p2p-mode-firefox',
      testMatch: /.*p2p-mode\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.P2P_MODE_URL || 'http://localhost:8080',
      },
    },

    // ============================================
    // Cross-Browser WebRTC Tests
    // ============================================
    {
      name: 'cross-browser-webrtc',
      testMatch: /.*cross-browser\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // ============================================
    // Connection Resilience Tests
    // ============================================
    {
      name: 'resilience-chromium',
      testMatch: /.*resilience\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // ============================================
    // Mobile/Responsive Tests
    // ============================================
    {
      name: 'mobile-p2p',
      testMatch: /.*mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],

  // Web server configurations for different test modes
  webServer: [
    // Static server for P2P mode tests
    {
      command: 'npx serve dist -l 8080 --cors',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      cwd: './',
    },
  ],
})
