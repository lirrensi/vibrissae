package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Config holds all server configuration
type Config struct {
	// Mode (explicit, no inference)
	Mode string `json:"mode"` // "direct" or "proxy"

	// Direct mode
	Domain string `json:"domain"` // Required for direct mode

	// Proxy mode
	Port int `json:"port"` // HTTP port (proxy mode)

	// Both modes
	TurnPort    int          `json:"turn_port"` // TURN UDP port
	PublicIP    string       `json:"public_ip"` // "auto" or explicit IP for TURN relay
	BaseURL     string       `json:"base_url"`
	RoomTTLMins int          `json:"room_ttl_minutes"`
	Turn        TurnConfig   `json:"turn"`
	TurnServers []TurnServer `json:"turn_servers"`
}

// TurnConfig holds embedded TURN server configuration
type TurnConfig struct {
	Enabled          bool   `json:"enabled"`
	RateLimitPerIP   int    `json:"rate_limit_per_ip"`
	CredentialTTLMin int    `json:"credential_ttl_minutes"`
	Secret           string `json:"secret"`
}

// TurnServer represents an external TURN server configuration
type TurnServer struct {
	URLs       string `json:"urls"`
	Username   string `json:"username,omitempty"`
	Credential string `json:"credential,omitempty"`
}

// LoadConfig reads configuration from a JSON file
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	cfg.ApplyDefaults()
	return &cfg, nil
}

// generateRandomSecret creates a cryptographically secure random secret
func generateRandomSecret() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ApplyDefaults sets default values for missing configuration fields
func (c *Config) ApplyDefaults() {
	if c.Port == 0 {
		c.Port = 8080
	}
	if c.TurnPort == 0 {
		c.TurnPort = 3478
	}
	if c.RoomTTLMins == 0 {
		c.RoomTTLMins = 60
	}
	// TURN enabled by default - works out of the box
	// But if user explicitly set a secret AND set Enabled=false, respect that
	if !c.Turn.Enabled && c.Turn.Secret == "" {
		c.Turn.Enabled = true
	}
	if c.Turn.RateLimitPerIP == 0 {
		c.Turn.RateLimitPerIP = 10
	}
	if c.Turn.CredentialTTLMin == 0 {
		c.Turn.CredentialTTLMin = 30
	}
	// Generate random secret if not provided
	if c.Turn.Secret == "" {
		c.Turn.Secret = generateRandomSecret()
	}
	// Direct mode: default public_ip to "auto"
	if c.Mode == "direct" && c.PublicIP == "" {
		c.PublicIP = "auto"
	}
}

// Validate checks that required configuration is present
func (c *Config) Validate() error {
	switch c.Mode {
	case "direct":
		if c.Domain == "" {
			return errors.New("domain required in direct mode")
		}
	case "proxy":
		if c.PublicIP == "" {
			return errors.New("public_ip required in proxy mode (can't auto-detect behind proxy)")
		}
	default:
		return errors.New("mode must be 'direct' or 'proxy'")
	}
	return nil
}

// IsDirectMode returns true if running in direct mode
func (c *Config) IsDirectMode() bool {
	return c.Mode == "direct"
}

// ResolvePublicIP resolves the public IP address
// In direct mode with "auto", fetches from external service
// Otherwise returns the configured value
func (c *Config) ResolvePublicIP() (string, error) {
	if c.PublicIP != "" && c.PublicIP != "auto" {
		return c.PublicIP, nil
	}

	// Auto-detect public IP
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.ipify.org")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	ip, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(ip)), nil
}

// FrontendConfig returns a sanitized config for the frontend
func (c *Config) FrontendConfig(creds TurnCredentials) map[string]interface{} {
	return map[string]interface{}{
		"baseUrl":         c.BaseURL,
		"turn":            map[string]interface{}{"enabled": c.Turn.Enabled, "port": c.TurnPort},
		"turnCredentials": creds,
		"turnServers":     c.TurnServers,
	}
}
