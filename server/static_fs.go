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
	// Try to find the web_ui/dist directory
	// First, check relative to working directory (for dev)
	staticDir := "web_ui/dist"
	if _, err := os.Stat(staticDir); err == nil {
		return http.Dir(staticDir)
	}

	// Try relative to binary location
	execPath, err := os.Executable()
	if err == nil {
		binDir := filepath.Dir(execPath)
		// Try: server/../web_ui/dist
		altDir := filepath.Join(binDir, "..", "web_ui", "dist")
		if _, err := os.Stat(altDir); err == nil {
			return http.Dir(altDir)
		}
		// Try: server/web_ui/dist
		altDir = filepath.Join(binDir, "web_ui", "dist")
		if _, err := os.Stat(altDir); err == nil {
			return http.Dir(altDir)
		}
	}

	// Fallback to default (will fail gracefully with 404s)
	return http.Dir("web_ui/dist")
}
