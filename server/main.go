package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/crypto/acme/autocert"
)

func main() {
	// Load config
	cfg, err := LoadConfig("config.json")
	if err != nil {
		log.Fatalf("No config.json found: %v", err)
	}

	if err := cfg.Validate(); err != nil {
		log.Fatalf("Invalid config: %v", err)
	}

	// Resolve public IP for TURN
	publicIP, err := cfg.ResolvePublicIP()
	if err != nil {
		log.Fatalf("Failed to resolve public IP: %v", err)
	}
	log.Printf("Public IP resolved: %s", publicIP)

	// Start TURN server (enabled by default)
	var turnServer *EmbeddedTurnServer
	if cfg.Turn.Enabled {
		turnServer, err = NewEmbeddedTurnServer(cfg.Turn, publicIP, cfg.TurnPort)
		if err != nil {
			log.Fatalf("Failed to start TURN server: %v", err)
		}
		defer turnServer.Close()
		log.Printf("TURN server started on 0.0.0.0:%d (UDP), advertising %s:%d", cfg.TurnPort, publicIP, cfg.TurnPort)
	}

	// Create room manager
	roomManager := NewRoomManager(time.Duration(cfg.RoomTTLMins) * time.Minute)
	defer roomManager.Stop()

	// Setup routes
	mux := http.NewServeMux()

	// WebSocket signaling
	signalingHandler := NewSignalingHandler(roomManager, cfg)
	mux.Handle("/ws/", signalingHandler)

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Room stats endpoint (for debugging)
	mux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		stats := map[string]interface{}{
			"rooms":      roomManager.RoomCount(),
			"turnServer": cfg.Turn.Enabled,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	})

	// Static files (SPA)
	spaHandler := NewSPAHandler(cfg)
	mux.Handle("/", spaHandler)

	// Mode-specific startup
	if cfg.IsDirectMode() {
		startDirectMode(cfg, mux)
	} else {
		startProxyMode(cfg, mux)
	}
}

// startDirectMode runs the server with autocert (Let's Encrypt)
func startDirectMode(cfg *Config, handler http.Handler) {
	// Setup autocert manager
	certManager := &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		HostPolicy: autocert.HostWhitelist(cfg.Domain),
		Cache:      autocert.DirCache("certs"),
	}

	// Create HTTPS server
	httpsServer := &http.Server{
		Addr:         ":443",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
		TLSConfig: &tls.Config{
			GetCertificate: certManager.GetCertificate,
		},
	}

	// Create HTTP server for ACME challenge and redirect
	httpHandler := certManager.HTTPHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Redirect to HTTPS
		http.Redirect(w, r, "https://"+r.Host+r.URL.String(), http.StatusMovedPermanently)
	}))

	httpServer := &http.Server{
		Addr:    ":80",
		Handler: httpHandler,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		httpsServer.Shutdown(ctx)
		httpServer.Shutdown(ctx)
	}()

	// Start servers
	log.Printf("VideoChat starting in DIRECT mode")
	log.Printf("Domain: %s", cfg.Domain)
	log.Printf("HTTPS server: https://%s", cfg.Domain)
	log.Printf("HTTP server: http://%s (redirects to HTTPS)", cfg.Domain)

	go func() {
		log.Printf("HTTP server listening on :80")
		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	if err := httpsServer.ListenAndServeTLS("", ""); err != http.ErrServerClosed {
		log.Fatalf("HTTPS server error: %v", err)
	}

	log.Println("Server stopped")
}

// startProxyMode runs the server in proxy mode (plain HTTP)
func startProxyMode(cfg *Config, handler http.Handler) {
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("VideoChat starting in PROXY mode")
	log.Printf("HTTP server listening on :%d", cfg.Port)
	log.Printf("WebSocket endpoint: ws://<host>:%d/ws/{roomId}", cfg.Port)
	if cfg.Turn.Enabled {
		log.Printf("TURN server: udp://<public_ip>:%d", cfg.TurnPort)
	}

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("Server stopped")
}
