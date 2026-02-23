package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Load config
	cfg, err := LoadConfig("config.json")
	if err != nil {
		log.Printf("No config.json found, using defaults: %v", err)
		cfg = &Config{}
	}
	cfg.ApplyDefaults()

	if err := cfg.Validate(); err != nil {
		log.Fatalf("Invalid config: %v", err)
	}

	// Start TURN server (enabled by default)
	var turnServer *EmbeddedTurnServer
	if cfg.Turn.Enabled {
		turnServer, err = NewEmbeddedTurnServer(cfg.Turn)
		if err != nil {
			log.Fatalf("Failed to start TURN server: %v", err)
		}
		defer turnServer.Close()
		log.Printf("TURN server started on port %d", cfg.Turn.Port)
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

	// Create server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      mux,
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

	log.Printf("VideoChat server starting on port %d", cfg.Port)
	log.Printf("WebSocket endpoint: ws://localhost:%d/ws/{roomId}", cfg.Port)
	if cfg.Turn.Enabled {
		log.Printf("TURN server: udp://localhost:%d", cfg.Turn.Port)
	}

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("Server stopped")
}
