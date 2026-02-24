package main

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/pion/turn/v4"
)

// EmbeddedTurnServer wraps pion/turn for embedded TURN functionality
type EmbeddedTurnServer struct {
	server     *turn.Server
	port       int
	secret     string
	maxPerIP   int
	rateLimits sync.Map // map[string]*int - IP address to connection count
}

// NewEmbeddedTurnServer creates a new embedded TURN server with HMAC authentication
// publicIP is the IP address clients use to connect (for relay address advertisement)
// port is the UDP port to listen on
func NewEmbeddedTurnServer(cfg TurnConfig, publicIP string, port int) (*EmbeddedTurnServer, error) {
	if !cfg.Enabled {
		return nil, nil
	}

	// Create UDP listener on all interfaces
	udpListener, err := net.ListenPacket("udp4", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		return nil, fmt.Errorf("failed to create UDP listener: %w", err)
	}

	server := &EmbeddedTurnServer{
		port:     port,
		secret:   cfg.Secret,
		maxPerIP: cfg.RateLimitPerIP,
	}

	// Parse public IP for relay address
	relayIP := net.ParseIP(publicIP)
	if relayIP == nil {
		relayIP = net.ParseIP("0.0.0.0")
	}

	// Create TURN server with our auth handler
	turnServer, err := turn.NewServer(turn.ServerConfig{
		Realm:       "videochat.local",
		AuthHandler: server.authHandler,
		PacketConnConfigs: []turn.PacketConnConfig{
			{
				PacketConn: udpListener,
				RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
					RelayAddress: relayIP,   // What clients connect to
					Address:      "0.0.0.0", // What we bind to
				},
			},
		},
	})
	if err != nil {
		udpListener.Close()
		return nil, fmt.Errorf("failed to create TURN server: %w", err)
	}

	server.server = turnServer
	log.Printf("Embedded TURN server started on 0.0.0.0:%d (UDP), advertising %s:%d", port, publicIP, port)

	// Start rate limit cleanup routine
	server.startRateLimitCleanup()

	return server, nil
}

// authHandler handles TURN authentication with HMAC and rate limiting
func (s *EmbeddedTurnServer) authHandler(username, realm string, srcAddr net.Addr) ([]byte, bool) {
	// Extract IP from source address
	ip := extractIP(srcAddr)

	// Check rate limit
	if !s.checkRateLimit(ip) {
		log.Printf("TURN rate limit exceeded for IP: %s", ip)
		return nil, false
	}

	// Validate credentials using our HMAC validation
	password, valid := ValidateTurnCredentialsForAuth(username, s.secret)
	if !valid {
		log.Printf("TURN auth failed for username: %s from IP: %s", username, ip)
		return nil, false
	}

	log.Printf("TURN auth succeeded for IP: %s", ip)
	return []byte(password), true
}

// checkRateLimit verifies if the IP is within rate limits
func (s *EmbeddedTurnServer) checkRateLimit(ip string) bool {
	countPtr, _ := s.rateLimits.LoadOrStore(ip, new(int))
	count := countPtr.(*int)

	if *count >= s.maxPerIP {
		return false
	}

	(*count)++
	return true
}

// decrementCount reduces the connection count for an IP
func (s *EmbeddedTurnServer) decrementCount(ip string) {
	if countPtr, ok := s.rateLimits.Load(ip); ok {
		count := countPtr.(*int)
		if *count > 0 {
			(*count)--
		}
	}
}

// startRateLimitCleanup periodically resets rate limit counters
func (s *EmbeddedTurnServer) startRateLimitCleanup() {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			s.rateLimits.Range(func(key, value interface{}) bool {
				s.rateLimits.Delete(key)
				return true
			})
		}
	}()
}

// Close stops the TURN server
func (s *EmbeddedTurnServer) Close() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

// extractIP extracts the IP address from a net.Addr
func extractIP(addr net.Addr) string {
	if udpAddr, ok := addr.(*net.UDPAddr); ok {
		return udpAddr.IP.String()
	}
	if tcpAddr, ok := addr.(*net.TCPAddr); ok {
		return tcpAddr.IP.String()
	}
	// Fallback: parse string representation
	host, _, err := net.SplitHostPort(addr.String())
	if err != nil {
		return addr.String()
	}
	return host
}
