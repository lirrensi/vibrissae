//go:build !embed

package main

import (
	"net/http"
	"os"
	"path/filepath"
)

// getStaticFS returns the filesystem-based handler for development builds
// This is used when NOT building with -tags embed
func getStaticFS() http.FileSystem {
	// Try to find the dist directory in order of preference:
	// 1. ./dist (running from server directory, after npm run build from web_ui)
	// 2. ./web_ui/dist (legacy location)
	// 3. ../web_ui/dist (running from server directory, old structure)

	// Check ./dist first (current build output location)
	if _, err := os.Stat("dist"); err == nil {
		return http.Dir("dist")
	}

	// Check web_ui/dist relative to working directory
	if _, err := os.Stat("web_ui/dist"); err == nil {
		return http.Dir("web_ui/dist")
	}

	// Try relative to binary location
	execPath, err := os.Executable()
	if err == nil {
		binDir := filepath.Dir(execPath)
		// Try: same directory as binary (dist/)
		altDir := filepath.Join(binDir, "dist")
		if _, err := os.Stat(altDir); err == nil {
			return http.Dir(altDir)
		}
		// Try: server/web_ui/dist (legacy)
		altDir = filepath.Join(binDir, "web_ui", "dist")
		if _, err := os.Stat(altDir); err == nil {
			return http.Dir(altDir)
		}
		// Try: ../web_ui/dist (from server binary)
		altDir = filepath.Join(binDir, "..", "web_ui", "dist")
		if _, err := os.Stat(altDir); err == nil {
			return http.Dir(altDir)
		}
	}

	// Fallback to default (will fail gracefully with 404s)
	return http.Dir("dist")
}
