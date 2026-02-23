//go:build !embed

package main

import (
	"net/http"
)

// getStaticFS returns the filesystem-based handler for development builds
// This is used when NOT building with -tags embed
func getStaticFS() http.FileSystem {
	// Serve from filesystem for dev flexibility
	// Path: web_ui/dist relative to working directory
	return http.Dir("web_ui/dist")
}
