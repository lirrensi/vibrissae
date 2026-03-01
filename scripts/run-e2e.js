/**
 * Comprehensive E2E Test Runner
 *
 * Usage:
 *   node scripts/run-e2e.js                    # Run all tests
 *   node scripts/run-e2e.js --mode server      # Run server mode tests only
 *   node scripts/run-e2e.js --mode p2p         # Run P2P mode tests only
 *   node scripts/run-e2e.js --mode single      # Run single-file tests only
 *   node scripts/run-e2e.js --project chrome   # Run specific project
 *   node scripts/run-e2e.js --ui               # Run with UI mode
 *
 * Options:
 *   --mode <mode>      Test mode: server, p2p, single, all (default: all)
 *   --project <name>   Playwright project name filter
 *   --ui               Run in UI mode
 *   --debug            Run in debug mode with headed browser
 *   --reporter <type>  Reporter: list, html, dot, json (default: list)
 *   --help             Show this help
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const WEB_UI_DIR = path.join(__dirname, '..', 'web_ui')
const SERVER_DIR = path.join(__dirname, '..', 'server')
const DIST_DIR = path.join(WEB_UI_DIR, 'dist')

const SERVER_PORT = 28080
const P2P_PORT = 8080

let serverProcess = null
let staticServerProcess = null

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForServer(url, timeout = 30000) {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) {
        console.log('✅ Server is ready')
        return true
      }
    } catch {
      // Server not ready yet
    }
    await sleep(500)
  }

  return false
}

function backupConfig() {
  const configPath = path.join(SERVER_DIR, 'config.json')
  const backupPath = path.join(SERVER_DIR, 'config.json.backup')
  const testConfigPath = path.join(SERVER_DIR, 'config.test.json')

  console.log('💾 Backing up config.json...')
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, backupPath)
  }
  if (fs.existsSync(testConfigPath)) {
    fs.copyFileSync(testConfigPath, configPath)
    console.log('🔧 Using test config')
  }
}

function restoreConfig() {
  const configPath = path.join(SERVER_DIR, 'config.json')
  const backupPath = path.join(SERVER_DIR, 'config.json.backup')

  console.log('💾 Restoring config.json...')
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, configPath)
    fs.unlinkSync(backupPath)
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting server...')

    const exePath = path.join(SERVER_DIR, 'videochat.exe')

    if (!fs.existsSync(exePath)) {
      reject(new Error('videochat.exe not found. Please build the server first: cd server && go build -o videochat.exe'))
      return
    }

    serverProcess = spawn(exePath, [], {
      cwd: SERVER_DIR,
      stdio: 'pipe',
    })

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim()
      if (output) console.log(`[Server] ${output}`)
    })

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString().trim()
      if (output) console.error(`[Server Error] ${output}`)
    })

    serverProcess.on('error', (err) => {
      reject(err)
    })

    setTimeout(() => resolve(serverProcess), 1000)
  })
}

function startStaticServer(port = P2P_PORT) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Starting static server on port ${port}...`)

    if (!fs.existsSync(DIST_DIR)) {
      console.warn('⚠️ dist/ not found. Building P2P mode first...')
      const buildProc = spawn('pnpm', ['build:p2p'], {
        cwd: WEB_UI_DIR,
        stdio: 'inherit',
        shell: true,
      })

      buildProc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('P2P build failed'))
          return
        }
        startStaticServerAfterBuild()
      })
    } else {
      startStaticServerAfterBuild()
    }

    function startStaticServerAfterBuild() {
      staticServerProcess = spawn('npx', ['serve', 'dist', '-l', port.toString(), '--cors'], {
        cwd: WEB_UI_DIR,
        stdio: 'pipe',
        shell: true,
      })

      staticServerProcess.stdout.on('data', (data) => {
        const output = data.toString().trim()
        if (output) console.log(`[Static Server] ${output}`)
      })

      staticServerProcess.stderr.on('data', (data) => {
        const output = data.toString().trim()
        if (output) console.error(`[Static Server Error] ${output}`)
      })

      staticServerProcess.on('error', (err) => {
        reject(err)
      })

      setTimeout(() => resolve(staticServerProcess), 2000)
    }
  })
}

async function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess && !staticServerProcess) {
      resolve()
      return
    }

    console.log('🛑 Stopping servers...')

    const processesToStop = []
    if (serverProcess) processesToStop.push(serverProcess)
    if (staticServerProcess) processesToStop.push(staticServerProcess)

    let stopped = 0

    processesToStop.forEach((proc) => {
      proc.on('close', () => {
        stopped++
        if (stopped >= processesToStop.length) {
          console.log('✅ Servers stopped')
          resolve()
        }
      })

      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'])
      } else {
        proc.kill('SIGTERM')
      }
    })

    // Force kill after 5 seconds
    setTimeout(() => {
      processesToStop.forEach((proc) => {
        if (!proc.killed) {
          proc.kill('SIGKILL')
        }
      })
      resolve()
    }, 5000)
  })
}

function runPlaywright(args = []) {
  return new Promise((resolve) => {
    console.log('🎭 Running Playwright tests...')
    console.log(`   Command: npx playwright test ${args.join(' ')}`)

    const proc = spawn('npx', ['playwright', 'test', ...args], {
      cwd: WEB_UI_DIR,
      stdio: 'inherit',
      shell: true,
    })

    proc.on('close', (code) => {
      resolve(code || 0)
    })
  })
}

async function buildSingleFile() {
  return new Promise((resolve, reject) => {
    console.log('📦 Building single-file P2P mode...')

    const proc = spawn('pnpm', ['build:p2p:single'], {
      cwd: WEB_UI_DIR,
      stdio: 'inherit',
      shell: true,
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('Single-file build failed'))
      }
    })
  })
}

function showHelp() {
  console.log(`
Comprehensive E2E Test Runner

Usage: node scripts/run-e2e.js [options]

Options:
  --mode <mode>      Test mode: server, p2p, single, all (default: all)
  --project <name>   Playwright project name filter
  --ui               Run in UI mode
  --debug            Run in debug mode with headed browser
  --reporter <type>  Reporter: list, html, dot, json (default: list)
  --help             Show this help

Examples:
  node scripts/run-e2e.js --mode server
  node scripts/run-e2e.js --mode p2p --project chromium
  node scripts/run-e2e.js --ui
  node scripts/run-e2e.js --debug --mode single
`)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help')) {
    showHelp()
    process.exit(0)
  }

  const mode = args.find((_, i) => args[i - 1] === '--mode') || 'all'
  const project = args.find((_, i) => args[i - 1] === '--project')
  const uiMode = args.includes('--ui')
  const debug = args.includes('--debug')
  const reporter = args.find((_, i) => args[i - 1] === '--reporter') || 'list'

  let exitCode = 1

  try {
    const playwrightArgs = []

    if (reporter) {
      playwrightArgs.push('--reporter', reporter)
    }

    if (uiMode) {
      playwrightArgs.push('--ui')
    }

    if (debug) {
      playwrightArgs.push('--debug')
    }

    if (project) {
      playwrightArgs.push('--project', project)
    }

    // Mode-specific setup
    if (mode === 'server' || mode === 'all') {
      console.log('\n📋 Running Server Mode Tests')
      console.log('=' .repeat(50))

      backupConfig()
      await startServer()

      console.log(`⏳ Waiting for server at http://localhost:${SERVER_PORT}...`)
      const isReady = await waitForServer(`http://localhost:${SERVER_PORT}`)

      if (!isReady) {
        console.error('❌ Server failed to start')
        process.exit(1)
      }

      // Run server mode tests
      const serverArgs = [...playwrightArgs, '--project', 'server-mode-chromium']
      const serverExitCode = await runPlaywright(serverArgs)

      if (serverExitCode !== 0) {
        console.error('❌ Server mode tests failed')
        exitCode = serverExitCode
      } else {
        console.log('✅ Server mode tests passed')
      }

      await stopServer()
      restoreConfig()
    }

    if (mode === 'p2p' || mode === 'all') {
      console.log('\n📋 Running P2P Mode Tests')
      console.log('=' .repeat(50))

      await startStaticServer(P2P_PORT)

      // Run P2P mode tests
      const p2pArgs = [...playwrightArgs, '--project', 'p2p-mode-chromium']
      const p2pExitCode = await runPlaywright(p2pArgs)

      if (p2pExitCode !== 0) {
        console.error('❌ P2P mode tests failed')
        exitCode = p2pExitCode
      } else {
        console.log('✅ P2P mode tests passed')
      }

      await stopServer()
    }

    if (mode === 'single' || mode === 'all') {
      console.log('\n📋 Running Single-File Mode Tests')
      console.log('=' .repeat(50))

      await buildSingleFile()

      // Run single-file tests
      const singleArgs = [...playwrightArgs, '--project', 'single-file-p2p-chromium']
      const singleExitCode = await runPlaywright(singleArgs)

      if (singleExitCode !== 0) {
        console.error('❌ Single-file tests failed')
        exitCode = singleExitCode
      } else {
        console.log('✅ Single-file tests passed')
      }
    }

    if (mode === 'all') {
      console.log('\n📋 Running Resilience Tests')
      console.log('=' .repeat(50))

      backupConfig()
      await startServer()
      await waitForServer(`http://localhost:${SERVER_PORT}`)

      const resilienceArgs = [...playwrightArgs, '--project', 'resilience-chromium']
      const resilienceExitCode = await runPlaywright(resilienceArgs)

      if (resilienceExitCode !== 0) {
        console.error('❌ Resilience tests failed')
        exitCode = resilienceExitCode
      } else {
        console.log('✅ Resilience tests passed')
      }

      await stopServer()
      restoreConfig()
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    exitCode = 1
  } finally {
    await stopServer()
    process.exit(exitCode)
  }
}

// Handle cleanup on interrupt
process.on('SIGINT', async () => {
  console.log('\n⚠️ Interrupted')
  await stopServer()
  process.exit(1)
})

main()
