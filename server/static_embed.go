//go:build !dev

package main

import (
	"embed"
	"io/fs"
	"net/http"
)

// embeddedFiles contains the embedded Vue app dist files
// This is included by default (production build).
// Use -tags dev to build without embedding (filesystem mode).
//
//go:embed dist/*
var embeddedFiles embed.FS

// getStaticFS returns the embedded filesystem for production builds
func getStaticFS() http.FileSystem {
	sub, err := fs.Sub(embeddedFiles, "dist")
	if err != nil {
		panic(err) // This should never fail if embed works correctly
	}
	return http.FS(sub)
}
