/**
 * Build Script for VideoChat
 *
 * This script:
 * 1. Builds the web UI (Vite)
 * 2. Copies dist to server/web_ui/dist for serving
 * 3. Rebuilds the Go server binary
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const WEB_UI_DIR = path.join(ROOT_DIR, 'web_ui');
const SERVER_DIR = path.join(ROOT_DIR, 'server');

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 Running: ${cmd} ${args.join(' ')}`);
    console.log(`   in: ${cwd}\n`);

    const proc = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function copyDir(src, dest) {
  console.log(`\n📁 Copying ${src} -> ${dest}`);

  // Create destination if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`   ✅ Copied ${entries.length} items`);
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    console.log(`\n🗑️  Removing ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    // Step 1: Build web UI
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Building Web UI');
    console.log('='.repeat(60));
    await runCommand('npm', ['run', 'build'], WEB_UI_DIR);

    // Step 2: Copy dist to server
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Copying dist to server');
    console.log('='.repeat(60));

    const distSrc = path.join(WEB_UI_DIR, 'dist');
    const distDest = path.join(SERVER_DIR, 'web_ui', 'dist');

    // Remove old dist in server
    removeDir(distDest);

    // Copy new dist
    copyDir(distSrc, distDest);

    // Step 3: Build Go server
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Building Go Server');
    console.log('='.repeat(60));

    const outputName = process.platform === 'win32' ? 'videochat.exe' : 'videochat';
    await runCommand('go', ['build', '-o', outputName, '.'], SERVER_DIR);

    console.log('\n' + '='.repeat(60));
    console.log('✅ BUILD COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\nServer binary: ${path.join(SERVER_DIR, outputName)}`);
    console.log(`Static files: ${distDest}`);
    console.log('\nTo run the server:');
    console.log('  cd server && ./videochat.exe');
    console.log('');

  } catch (err) {
    console.error('\n❌ Build failed:', err.message);
    process.exit(1);
  }
}

main();
