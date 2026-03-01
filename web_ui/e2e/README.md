# VideoChat E2E Test Suite

Comprehensive end-to-end testing for VideoChat with real browser WebRTC testing.

## Overview

This test suite covers all deployment modes and scenarios:

- **Single-File P2P Mode** - GitHub Pages deployment with embedded config
- **Server Mode** - Go server with WebSocket signaling and TURN
- **P2P Mode** - Trystero/GunJS decentralized signaling
- **Cross-Browser** - Chrome and Firefox compatibility
- **Resilience** - Connection recovery, reconnection, stability
- **Mobile** - Responsive design and touch controls

## Quick Start

### Run All Tests

```bash
# From web_ui directory
pnpm test:e2e:all

# Or from project root
node scripts/run-e2e.js --mode all
```

### Run Specific Test Modes

```bash
# Server mode tests (WebSocket signaling)
pnpm test:e2e:server

# P2P mode tests (Trystero/GunJS)
pnpm test:e2e:p2p

# Single-file tests (GitHub Pages)
pnpm test:e2e:single

# Cross-browser tests
pnpm test:e2e:cross-browser

# Resilience tests
pnpm test:e2e:resilience

# Mobile tests
pnpm test:e2e:mobile
```

### Debug Mode

```bash
# Run with UI mode for interactive debugging
pnpm test:e2e:ui

# Run with headed browser and debug tools
pnpm test:e2e:debug

# Run specific test file
npx playwright test e2e/server-mode.spec.ts --debug

# Run specific test by name
npx playwright test -g "two peers connect"
```

## Test Files

| File | Description |
|------|-------------|
| `e2e/single-file.spec.ts` | Single-file P2P mode tests |
| `e2e/server-mode.spec.ts` | Server mode with WebSocket |
| `e2e/cross-browser.spec.ts` | Cross-browser WebRTC |
| `e2e/resilience.spec.ts` | Connection resilience |
| `e2e/mobile.spec.ts` | Mobile/responsive tests |
| `e2e/p2p.spec.ts` | Legacy P2P tests (kept for compatibility) |
| `e2e/webrtc.spec.ts` | Legacy WebRTC tests (kept for compatibility) |

## Prerequisites

### For Server Mode Tests

```bash
# Build the Go server
cd server
go build -o videochat.exe
```

### For Single-File Tests

```bash
# Build single-file bundle
cd web_ui
pnpm build:p2p:single
```

### Install Playwright Browsers

```bash
npx playwright install
```

## Configuration

### Playwright Config

See `playwright.config.ts` for:
- Browser configurations
- Test timeouts
- Base URLs for different modes
- Fake media stream settings

### Environment Variables

```bash
# Override base URLs
export PLAYWRIGHT_BASE_URL=http://localhost:8080
export SERVER_MODE_URL=http://localhost:28080
export P2P_MODE_URL=http://localhost:8080
export SINGLE_FILE_URL=file:///path/to/dist/index.html
```

## Test Modes Explained

### Single-File P2P Mode

Tests the GitHub Pages deployment where:
- Entire app bundled into single HTML file
- P2P config embedded (no fetch)
- Trystero for signaling via WebTorrent/MQTT
- GunJS for redundant signaling

```bash
pnpm test:e2e:single
```

### Server Mode

Tests the Go server deployment where:
- WebSocket signaling via `/ws/{roomId}`
- Embedded TURN server for NAT traversal
- Server injects `__CONFIG__` with ICE servers

```bash
pnpm test:e2e:server
```

### P2P Mode

Tests the static P2P deployment where:
- Served via static HTTP server
- Trystero/GunJS for signaling
- No server involvement

```bash
pnpm test:e2e:p2p
```

## Key Test Scenarios

### WebRTC Connection Tests

- ✅ Local camera activation
- ✅ Two-peer connection establishment
- ✅ Remote video streaming
- ✅ Data channel communication
- ✅ ICE server configuration
- ✅ Connection stats validation

### Resilience Tests

- ✅ Peer reconnection after refresh
- ✅ Graceful disconnection handling
- ✅ ICE restart on failure
- ✅ Long-running call stability (60s)
- ✅ Rapid join/leave cycles
- ✅ Memory leak detection

### Mobile Tests

- ✅ Responsive layout
- ✅ Touch-friendly controls
- ✅ Portrait/landscape orientation
- ✅ Mobile WebRTC support
- ✅ Permission handling

## CI/CD Integration

### GitHub Actions

The CI workflow runs:

1. **Quick E2E** (PR only) - Server mode tests for fast feedback
2. **Comprehensive E2E** - All test modes
3. **Cross-Browser** - Chrome and Firefox

See `.github/workflows/ci.yml` for details.

### Local CI Simulation

```bash
# Simulate CI environment
node scripts/run-e2e.js --mode all --reporter list
```

## Troubleshooting

### Tests Fail with "Timeout"

Increase timeout in `playwright.config.ts`:

```typescript
export default defineConfig({
  timeout: 120 * 1000, // 2 minutes
  expect: { timeout: 30000 },
})
```

### WebRTC Connection Not Established

Check:
1. Fake media stream flags are set (configured in playwright.config.ts)
2. Ports are not blocked by firewall
3. TURN server is running (for server mode)

### Server Mode Tests Fail

Ensure:
1. Server is built: `cd server && go build`
2. Test config is used: `config.test.json`
3. Server is running on port 28080

```bash
# Start server manually for debugging
cd server
./videochat.exe
```

### Single-File Tests Fail

Ensure:
1. Single-file build exists: `pnpm build:p2p:single`
2. File path is correct in config

## Debugging Tips

### View Console Logs

Tests capture and log all console messages:

```typescript
peerAPage.on('console', msg => {
  console.log(`[Peer A ${msg.type()}] ${msg.text()}`)
})
```

### Inspect Network Requests

```typescript
peerAPage.on('websocket', ws => {
  ws.on('framereceived', data => {
    console.log('WS Received:', data)
  })
})
```

### Take Screenshots

```typescript
await peerAPage.screenshot({ path: 'debug.png' })
```

### Record Video

Videos are recorded on first retry (configured in playwright.config.ts).

## Test Output

### HTML Report

```bash
# Generate and open HTML report
npx playwright show-report
```

### JSON Output

```bash
npx playwright test --reporter=json --output=results.json
```

## Performance Benchmarks

| Test | Expected Duration |
|------|------------------|
| Single-file load | < 3s |
| Server mode connection | < 10s |
| P2P connection | < 15s |
| Cross-browser test | < 30s |
| Resilience (1 min call) | ~70s |
| Full suite | ~10-15 min |

## Contributing

### Adding New Tests

1. Create test file in `e2e/` directory
2. Use existing test patterns
3. Add to appropriate project in `playwright.config.ts`
4. Update this README

### Test Best Practices

- Use `data-testid` attributes for selectors
- Wait for specific conditions, not arbitrary timeouts
- Clean up resources in `afterEach`
- Log useful debug information
- Handle flaky scenarios gracefully

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Test](https://playwright.dev/docs/test-intro)
- [WebRTC Testing](https://playwright.dev/docs/emulation#simulate-media-devices)
- [GitHub Actions](https://docs.github.com/en/actions)
