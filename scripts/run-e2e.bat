@echo off
REM Comprehensive E2E Test Runner for Windows
REM
REM Usage:
REM   run-e2e.bat                    - Run all tests
REM   run-e2e.bat server             - Run server mode tests only
REM   run-e2e.bat p2p                - Run P2P mode tests only
REM   run-e2e.bat single             - Run single-file tests only
REM   run-e2e.bat ui                 - Run with UI mode
REM   run-e2e.bat debug              - Run in debug mode

setlocal enabledelayedexpansion

set MODE=%1
set UI_MODE=
set DEBUG=

if "%MODE%"=="ui" (
    set MODE=all
    set UI_MODE=--ui
)
if "%MODE%"=="debug" (
    set MODE=all
    set DEBUG=--debug
)

echo.
echo ============================================
echo VideoChat E2E Test Suite
echo ============================================
echo Mode: %MODE%
if not "%UI_MODE%"=="" echo UI Mode: Enabled
if not "%DEBUG%"=="" echo Debug: Enabled
echo ============================================
echo.

REM Run the Node.js test runner
node scripts\run-e2e.js --mode %MODE% %UI_MODE% %DEBUG%

set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE%==0 (
    echo ============================================
    echo ✅ All E2E tests passed!
    echo ============================================
) else (
    echo ============================================
    echo ❌ E2E tests failed with exit code %EXIT_CODE%
    echo ============================================
)

endlocal
exit /b %EXIT_CODE%
