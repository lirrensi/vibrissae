/**
 * E2E Test Runner - Local Testing
 *
 * Usage: node scripts/e2e-test.js
 *
 * This script:
 * 1. Backs up the current config.json
 * 2. Copies config.test.json to config.json
 * 3. Starts the Go server
 * 4. Waits for server to be ready
 * 5. Runs Playwright tests
 * 6. Restores original config.json
 * 7. Stops the server
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const WEB_UI_DIR = path.join(__dirname, '..', 'web_ui');
const CONFIG_PATH = path.join(SERVER_DIR, 'config.json');
const CONFIG_BACKUP_PATH = path.join(SERVER_DIR, 'config.json.backup');
const CONFIG_TEST_PATH = path.join(SERVER_DIR, 'config.test.json');

const SERVER_PORT = 28080;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let serverProcess = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        console.log('✅ Server is ready');
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await sleep(500);
  }

  return false;
}

function backupConfig() {
  console.log('💾 Backing up config.json...');
  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, CONFIG_BACKUP_PATH);
  }
}

function restoreConfig() {
  console.log('💾 Restoring config.json...');
  if (fs.existsSync(CONFIG_BACKUP_PATH)) {
    fs.copyFileSync(CONFIG_BACKUP_PATH, CONFIG_PATH);
    fs.unlinkSync(CONFIG_BACKUP_PATH);
  }
}

function useTestConfig() {
  console.log('🔧 Using test config...');
  fs.copyFileSync(CONFIG_TEST_PATH, CONFIG_PATH);
}

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting server...');

    const exePath = path.join(SERVER_DIR, 'videochat.exe');

    if (!fs.existsSync(exePath)) {
      reject(new Error('videochat.exe not found. Please build the server first: cd server && go build -o videochat.exe'));
      return;
    }

    serverProcess = spawn(exePath, [], {
      cwd: SERVER_DIR,
      stdio: 'pipe',
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) console.log(`[Server] ${output}`);
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) console.error(`[Server Error] ${output}`);
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    // Give the server a moment to start
    setTimeout(() => resolve(serverProcess), 1000);
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    console.log('🛑 Stopping server...');

    serverProcess.on('close', () => {
      console.log('✅ Server stopped');
      resolve();
    });

    // Kill the process
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t']);
    } else {
      serverProcess.kill('SIGTERM');
    }

    // Force kill after 5 seconds
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      resolve();
    }, 5000);
  });
}

async function runPlaywrightTests() {
  return new Promise((resolve) => {
    console.log('🎭 Running Playwright tests...');

    // Use the main playwright config but override baseURL via env var
    const proc = spawn('npx', ['playwright', 'test'], {
      cwd: WEB_UI_DIR,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: SERVER_URL,
      },
    });

    proc.on('close', (code) => {
      resolve(code || 0);
    });
  });
}

async function main() {
  let exitCode = 1;

  try {
    // Setup config
    backupConfig();
    useTestConfig();

    // Start server
    await startServer();

    // Wait for server to be ready
    console.log(`⏳ Waiting for server at ${SERVER_URL}...`);
    const isReady = await waitForServer(SERVER_URL);

    if (!isReady) {
      console.error('❌ Server failed to start');
      process.exit(1);
    }

    // Run tests
    exitCode = await runPlaywrightTests();

  } catch (err) {
    console.error('❌ Error:', err.message);
    exitCode = 1;
  } finally {
    // Cleanup
    await stopServer();
    restoreConfig();
    process.exit(exitCode);
  }
}

// Handle cleanup on interrupt
process.on('SIGINT', async () => {
  console.log('\n⚠️ Interrupted');
  await stopServer();
  restoreConfig();
  process.exit(1);
});

main();
