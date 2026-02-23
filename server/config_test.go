package main

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ============================================================================
// Lens 1: Deletion Immunity - These tests verify config functions actually work
// Lens 2: Assumption Audit - Tests verify assumptions about config behavior
// Lens 3: Edge Case Flood - Tests empty, invalid, and boundary configs
// ============================================================================

func TestLoadConfig_FileNotFound(t *testing.T) {
	_, err := LoadConfig("nonexistent_config_12345.json")
	if err == nil {
		t.Error("LoadConfig should return error for nonexistent file")
	}
}

func TestLoadConfig_ValidFile(t *testing.T) {
	// Create temp config file
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	configData := `{
		"port": 9090,
		"base_url": "https://example.com",
		"room_ttl_minutes": 120,
		"turn": {
			"enabled": true,
			"port": 3479,
			"rate_limit_per_ip": 20,
			"credential_ttl_minutes": 60,
			"secret": "testsecret123"
		}
	}`

	if err := os.WriteFile(configPath, []byte(configData), 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Port != 9090 {
		t.Errorf("Expected Port 9090, got %d", cfg.Port)
	}
	if cfg.BaseURL != "https://example.com" {
		t.Errorf("Expected BaseURL 'https://example.com', got %s", cfg.BaseURL)
	}
	if cfg.RoomTTLMins != 120 {
		t.Errorf("Expected RoomTTLMins 120, got %d", cfg.RoomTTLMins)
	}
	if !cfg.Turn.Enabled {
		t.Error("Expected Turn.Enabled to be true")
	}
	if cfg.Turn.Port != 3479 {
		t.Errorf("Expected Turn.Port 3479, got %d", cfg.Turn.Port)
	}
	if cfg.Turn.Secret != "testsecret123" {
		t.Errorf("Expected Turn.Secret 'testsecret123', got %s", cfg.Turn.Secret)
	}
}

func TestLoadConfig_InvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "invalid_config.json")

	invalidJSON := `{invalid json`

	if err := os.WriteFile(configPath, []byte(invalidJSON), 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	_, err := LoadConfig(configPath)
	if err == nil {
		t.Error("LoadConfig should return error for invalid JSON")
	}
}

func TestLoadConfig_EmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "empty_config.json")

	if err := os.WriteFile(configPath, []byte("{}"), 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig should handle empty JSON object: %v", err)
	}

	// Defaults should be applied
	if cfg.Port != 8080 {
		t.Errorf("Expected default Port 8080, got %d", cfg.Port)
	}
}

func TestApplyDefaults_AllFields(t *testing.T) {
	cfg := &Config{}
	cfg.ApplyDefaults()

	// Check all defaults
	if cfg.Port != 8080 {
		t.Errorf("Expected default Port 8080, got %d", cfg.Port)
	}
	if cfg.RoomTTLMins != 60 {
		t.Errorf("Expected default RoomTTLMins 60, got %d", cfg.RoomTTLMins)
	}
	if !cfg.Turn.Enabled {
		t.Error("Expected Turn.Enabled to be true by default")
	}
	if cfg.Turn.Port != 3478 {
		t.Errorf("Expected default Turn.Port 3478, got %d", cfg.Turn.Port)
	}
	if cfg.Turn.RateLimitPerIP != 10 {
		t.Errorf("Expected default Turn.RateLimitPerIP 10, got %d", cfg.Turn.RateLimitPerIP)
	}
	if cfg.Turn.CredentialTTLMin != 30 {
		t.Errorf("Expected default Turn.CredentialTTLMin 30, got %d", cfg.Turn.CredentialTTLMin)
	}
	if cfg.Turn.Secret == "" {
		t.Error("Expected Turn.Secret to be auto-generated")
	}
}

func TestApplyDefaults_PartialOverride(t *testing.T) {
	cfg := &Config{
		Port: 3000,
		Turn: TurnConfig{
			Port: 5000,
		},
	}
	cfg.ApplyDefaults()

	// Specified values should remain
	if cfg.Port != 3000 {
		t.Errorf("Expected Port 3000, got %d", cfg.Port)
	}
	if cfg.Turn.Port != 5000 {
		t.Errorf("Expected Turn.Port 5000, got %d", cfg.Turn.Port)
	}

	// Unspecified values should have defaults
	if cfg.RoomTTLMins != 60 {
		t.Errorf("Expected default RoomTTLMins 60, got %d", cfg.RoomTTLMins)
	}
	if cfg.Turn.RateLimitPerIP != 10 {
		t.Errorf("Expected default Turn.RateLimitPerIP 10, got %d", cfg.Turn.RateLimitPerIP)
	}
}

func TestApplyDefaults_TurnAutoEnable(t *testing.T) {
	// When both Enabled and Port are default (false and 0), TURN should be enabled
	// This is the "works out of the box" behavior
	cfg := &Config{}
	cfg.ApplyDefaults()

	if !cfg.Turn.Enabled {
		t.Error("TURN should be auto-enabled when not explicitly configured")
	}
}

func TestApplyDefaults_TurnPortSetNotEnabled(t *testing.T) {
	// If Port is set but Enabled is not explicitly set (defaults to false),
	// the condition !Enabled && Port==0 is false (because Port != 0),
	// so TURN stays disabled.
	// This is the current behavior - may be a bug or intentional.
	cfg := &Config{
		Turn: TurnConfig{
			Port: 3479,
		},
	}
	cfg.ApplyDefaults()

	// Current behavior: when Port is set, Enabled stays false
	// This is because the auto-enable only triggers when BOTH are default
	if cfg.Turn.Enabled {
		t.Error("Current behavior: Port set means no auto-enable")
	}
}

func TestApplyDefaults_TurnExplicitlyDisabled(t *testing.T) {
	// Interestingly, setting Enabled=false alone still auto-enables!
	// Because: !false && 0==0 = true && true = true
	// This is the "works out of the box" behavior - to explicitly disable,
	// you need to set Port to non-zero
	cfg := &Config{
		Turn: TurnConfig{
			Enabled: false,
		},
	}
	cfg.ApplyDefaults()

	// Auto-enable kicks in because Port is still 0
	if !cfg.Turn.Enabled {
		t.Error("Current behavior: setting only Enabled=false still auto-enables")
	}
}

func TestApplyDefaults_TurnExplicitlyDisabledWithPort(t *testing.T) {
	// To actually disable TURN, set both Enabled=false AND Port to non-zero
	cfg := &Config{
		Turn: TurnConfig{
			Enabled: false,
			Port:    1, // Any non-zero port
		},
	}
	cfg.ApplyDefaults()

	// This should stay disabled
	if cfg.Turn.Enabled {
		t.Error("Turn should stay disabled when explicitly set to false with non-zero port")
	}
}

func TestGenerateRandomSecret(t *testing.T) {
	secret1 := generateRandomSecret()
	secret2 := generateRandomSecret()

	// Should generate 64 hex characters (32 bytes)
	if len(secret1) != 64 {
		t.Errorf("Expected secret length 64, got %d", len(secret1))
	}

	// Should be valid hex
	_, err := hex.DecodeString(secret1)
	if err != nil {
		t.Errorf("Secret should be valid hex: %v", err)
	}

	// Two secrets should be different (extremely likely with crypto/rand)
	if secret1 == secret2 {
		t.Error("Two generated secrets should be different")
	}
}

func TestGenerateRandomSecret_AllHexChars(t *testing.T) {
	// Generate multiple secrets and check we get variety of hex chars
	seen := make(map[rune]bool)
	for i := 0; i < 100; i++ {
		secret := generateRandomSecret()
		for _, c := range secret {
			seen[c] = true
		}
	}

	// Should have seen all hex digits
	expectedChars := "0123456789abcdef"
	for _, c := range expectedChars {
		if !seen[c] {
			t.Errorf("Expected to see hex char %c in generated secrets", c)
		}
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		config  *Config
		wantErr bool
	}{
		{
			name:    "empty config",
			config:  &Config{},
			wantErr: false, // Validate currently returns nil always
		},
		{
			name: "full config",
			config: &Config{
				Port:        8080,
				RoomTTLMins: 60,
				Turn: TurnConfig{
					Enabled: true,
					Port:    3478,
					Secret:  "secret",
				},
			},
			wantErr: false,
		},
		{
			name: "zero port",
			config: &Config{
				Port: 0,
			},
			wantErr: false, // No validation on port
		},
		{
			name: "negative port",
			config: &Config{
				Port: -1,
			},
			wantErr: false, // No validation on negative port
		},
		{
			name: "turn enabled without secret",
			config: &Config{
				Turn: TurnConfig{
					Enabled: true,
					Secret:  "",
				},
			},
			wantErr: false, // Secret will be generated
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestFrontendConfig(t *testing.T) {
	cfg := &Config{
		BaseURL:     "https://test.example.com",
		RoomTTLMins: 30,
		Turn: TurnConfig{
			Enabled: true,
			Port:    3478,
			Secret:  "testsecret",
		},
		TurnServers: []TurnServer{
			{URLs: "turn:external.com:3478", Username: "user", Credential: "cred"},
		},
	}

	creds := TurnCredentials{
		Username: "testuser",
		Password: "testpass",
	}

	feConfig := cfg.FrontendConfig(creds)

	// Check all expected fields exist
	if feConfig["baseUrl"] != "https://test.example.com" {
		t.Errorf("Expected baseUrl 'https://test.example.com', got %v", feConfig["baseUrl"])
	}

	turnConfig, ok := feConfig["turn"].(map[string]interface{})
	if !ok {
		t.Fatal("turn config should be a map")
	}
	if turnConfig["enabled"] != true {
		t.Error("Expected turn.enabled to be true")
	}
	if turnConfig["port"] != 3478 {
		t.Errorf("Expected turn.port 3478, got %v", turnConfig["port"])
	}

	if feConfig["turnCredentials"] != creds {
		t.Errorf("Expected turnCredentials to match, got %v", feConfig["turnCredentials"])
	}

	turnServers, ok := feConfig["turnServers"].([]TurnServer)
	if !ok {
		t.Fatal("turnServers should be a slice")
	}
	if len(turnServers) != 1 {
		t.Errorf("Expected 1 turn server, got %d", len(turnServers))
	}
}

func TestFrontendConfig_NoSecretLeak(t *testing.T) {
	cfg := &Config{
		Turn: TurnConfig{
			Enabled: true,
			Secret:  "super_secret_do_not_leak",
		},
	}

	creds := TurnCredentials{Username: "u", Password: "p"}
	feConfig := cfg.FrontendConfig(creds)

	// Marshal to check JSON doesn't contain secret
	data, _ := json.Marshal(feConfig)
	jsonStr := string(data)

	if strings.Contains(jsonStr, "super_secret_do_not_leak") {
		t.Error("FrontendConfig should NOT expose TURN secret")
	}
}

func TestTurnServer_JSONFields(t *testing.T) {
	ts := TurnServer{
		URLs:       "turn:example.com:3478",
		Username:   "testuser",
		Credential: "testcred",
	}

	data, err := json.Marshal(ts)
	if err != nil {
		t.Fatalf("Failed to marshal TurnServer: %v", err)
	}

	var parsed TurnServer
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal TurnServer: %v", err)
	}

	if parsed.URLs != ts.URLs {
		t.Errorf("Expected URLs %s, got %s", ts.URLs, parsed.URLs)
	}
	if parsed.Username != ts.Username {
		t.Errorf("Expected Username %s, got %s", ts.Username, parsed.Username)
	}
	if parsed.Credential != ts.Credential {
		t.Errorf("Expected Credential %s, got %s", ts.Credential, parsed.Credential)
	}
}

func TestTurnServer_OptionalFields(t *testing.T) {
	// TurnServer without username/credential (public TURN)
	jsonData := `{"urls": "stun:stun.l.google.com:19302"}`

	var ts TurnServer
	if err := json.Unmarshal([]byte(jsonData), &ts); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if ts.URLs != "stun:stun.l.google.com:19302" {
		t.Errorf("Expected URLs 'stun:stun.l.google.com:19302', got %s", ts.URLs)
	}
	if ts.Username != "" {
		t.Errorf("Expected empty Username, got %s", ts.Username)
	}
}

// ============================================================================
// Mutation Chamber: These tests verify the code actually does what we expect
// ============================================================================

func TestApplyDefaults_MutationPort(t *testing.T) {
	// If we change the default port, this should fail
	cfg := &Config{}
	cfg.ApplyDefaults()

	// This test documents the expected default
	if cfg.Port != 8080 {
		t.Errorf("Port default changed! Expected 8080, got %d", cfg.Port)
	}
}

func TestApplyDefaults_MutationTTL(t *testing.T) {
	cfg := &Config{}
	cfg.ApplyDefaults()

	if cfg.RoomTTLMins != 60 {
		t.Errorf("RoomTTLMins default changed! Expected 60, got %d", cfg.RoomTTLMins)
	}
}
