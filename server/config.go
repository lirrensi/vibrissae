package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
)

// Config holds all server configuration
type Config struct {
	Port        int          `json:"port"`
	BaseURL     string       `json:"base_url"`
	RoomTTLMins int          `json:"room_ttl_minutes"`
	Turn        TurnConfig   `json:"turn"`
	TurnServers []TurnServer `json:"turn_servers"`
}

// TurnConfig holds embedded TURN server configuration
type TurnConfig struct {
	Enabled          bool   `json:"enabled"`
	Port             int    `json:"port"`
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
	if c.RoomTTLMins == 0 {
		c.RoomTTLMins = 60
	}
	// TURN enabled by default - works out of the box
	if !c.Turn.Enabled && c.Turn.Port == 0 {
		c.Turn.Enabled = true
	}
	if c.Turn.Port == 0 {
		c.Turn.Port = 3478
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
}

// Validate checks that required configuration is present
func (c *Config) Validate() error {
	// No required fields for basic operation
	// TURN secret is only required if TURN is enabled
	return nil
}

// FrontendConfig returns a sanitized config for the frontend
func (c *Config) FrontendConfig(creds TurnCredentials) map[string]interface{} {
	return map[string]interface{}{
		"baseUrl":         c.BaseURL,
		"turn":            map[string]interface{}{"enabled": c.Turn.Enabled, "port": c.Turn.Port},
		"turnCredentials": creds,
		"turnServers":     c.TurnServers,
	}
}
