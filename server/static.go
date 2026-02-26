package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// SPAHandler serves the Vue SPA with config injection
type SPAHandler struct {
	staticFS http.FileSystem
	config   *Config
	localIP  string // Resolved local IP for local mode
}

// NewSPAHandler creates a new SPA handler
// Uses getStaticFS() which returns embedded or filesystem-based handler
// depending on build tags
func NewSPAHandler(config *Config) *SPAHandler {
	return &SPAHandler{
		staticFS: getStaticFS(),
		config:   config,
		localIP:  "", // Will be set via SetLocalIP if needed
	}
}

// SetLocalIP sets the local IP for local mode
func (h *SPAHandler) SetLocalIP(ip string) {
	h.localIP = ip
}

// ServeHTTP serves static files or index.html for SPA routing
func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Clean the path
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}

	// Try to open the file
	f, err := h.staticFS.Open(path)
	if err == nil {
		f.Close()
		// File exists, serve it
		http.FileServer(h.staticFS).ServeHTTP(w, r)
		return
	}

	// File doesn't exist, serve index.html for SPA routing
	h.serveIndexWithConfig(w, r)
}

// serveIndexWithConfig serves index.html with runtime config injected
func (h *SPAHandler) serveIndexWithConfig(w http.ResponseWriter, r *http.Request) {
	// Open index.html
	f, err := h.staticFS.Open("index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	// Read the content
	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "failed to stat index.html", http.StatusInternalServerError)
		return
	}

	content := make([]byte, stat.Size())
	_, err = f.Read(content)
	if err != nil {
		http.Error(w, "failed to read index.html", http.StatusInternalServerError)
		return
	}

	// Generate TURN credentials for this request
	var creds TurnCredentials
	if h.config.Turn.Enabled && h.config.Turn.Secret != "" {
		creds = GenerateTurnCredentials("", h.config.Turn.Secret, h.config.Turn.CredentialTTLMin)
	}

	// Build config JSON
	configData := h.config.FrontendConfig(creds)

	// For local mode, use the resolved local IP as baseUrl for TURN
	// This ensures TURN server address is correct even when accessing via localhost
	if h.config.IsLocalMode() && h.localIP != "" {
		configData["baseUrl"] = h.localIP
	}

	configJSON, err := json.Marshal(configData)
	if err != nil {
		log.Printf("Failed to marshal config: %v", err)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(content)
		return
	}

	// Inject config script into head
	html := string(content)
	configScript := `<script>window.__CONFIG__=` + string(configJSON) + `;</script>`

	// Try to inject before </head>
	if idx := strings.Index(html, "</head>"); idx != -1 {
		html = html[:idx] + configScript + html[idx:]
	} else if idx := strings.Index(html, "<head>"); idx != -1 {
		// Fallback: inject after <head>
		idx += len("<head>")
		html = html[:idx] + configScript + html[idx:]
	} else {
		// Last resort: prepend
		html = configScript + html
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(html))
}

// CheckStaticDir checks if the static directory exists (for development mode)
func CheckStaticDir() string {
	// Check ./dist first (current build output)
	if _, err := os.Stat("dist"); err == nil {
		return "dist"
	}
	// Check legacy web_ui/dist
	staticDir := "web_ui/dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		// Try relative to binary location
		execPath, _ := os.Executable()
		binDir := filepath.Dir(execPath)
		altDir := filepath.Join(binDir, "dist")
		if _, err := os.Stat(altDir); err == nil {
			return altDir
		}
		altDir = filepath.Join(binDir, "web_ui", "dist")
		if _, err := os.Stat(altDir); err == nil {
			return altDir
		}
		return ""
	}
	return staticDir
}
