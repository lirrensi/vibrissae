package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

// ============================================================================
// Lens 1: Deletion Immunity - These tests verify auth functions actually work
// Lens 2: Assumption Audit - Tests verify assumptions about credential format
// Lens 3: Edge Case Flood - Tests empty, invalid, expired credentials
// Lens 5: Chaos Monkey - Tests malformed inputs, timing edge cases
// ============================================================================

func TestGenerateTurnCredentials_Format(t *testing.T) {
	creds := GenerateTurnCredentials("room123", "secretkey", 30)

	// Username format should be "timestamp:roomID"
	parts := strings.Split(creds.Username, ":")
	if len(parts) != 2 {
		t.Errorf("Username should be 'timestamp:roomID', got %s", creds.Username)
	}

	// First part should be a valid timestamp (number)
	_, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		t.Errorf("Timestamp part should be a number, got %s", parts[0])
	}

	// Second part should be the room ID
	if parts[1] != "room123" {
		t.Errorf("Room ID should be 'room123', got %s", parts[1])
	}

	// Password should not be empty
	if creds.Password == "" {
		t.Error("Password should not be empty")
	}

	// Password should be valid base64
	_, err = base64.StdEncoding.DecodeString(creds.Password)
	if err != nil {
		t.Errorf("Password should be valid base64: %v", err)
	}
}

func TestGenerateTurnCredentials_TimestampFuture(t *testing.T) {
	now := time.Now().Unix() / 60
	creds := GenerateTurnCredentials("room", "secret", 30)

	parts := strings.Split(creds.Username, ":")
	timestamp, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		t.Fatalf("Failed to parse timestamp: %v", err)
	}

	// Timestamp should be in the future (ttl minutes from now)
	expectedMin := now + 30 - 1 // allow 1 minute tolerance
	if timestamp < expectedMin {
		t.Errorf("Timestamp should be at least %d (30 min from now), got %d", expectedMin, timestamp)
	}
}

func TestGenerateTurnCredentials_DifferentSecrets(t *testing.T) {
	creds1 := GenerateTurnCredentials("room", "secret1", 30)
	creds2 := GenerateTurnCredentials("room", "secret2", 30)

	// Same room, different secrets should produce different passwords
	if creds1.Password == creds2.Password {
		t.Error("Different secrets should produce different passwords")
	}
}

func TestGenerateTurnCredentials_DifferentRooms(t *testing.T) {
	creds1 := GenerateTurnCredentials("room1", "secret", 30)
	creds2 := GenerateTurnCredentials("room2", "secret", 30)

	// Same secret, different rooms should produce different usernames
	if creds1.Username == creds2.Username {
		t.Error("Different rooms should produce different usernames")
	}
}

func TestValidateTurnCredentials_Valid(t *testing.T) {
	secret := "testsecret"
	roomID := "room123"
	ttl := 30

	creds := GenerateTurnCredentials(roomID, secret, ttl)

	// Immediately validate should succeed
	if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
		t.Error("Valid credentials should validate successfully")
	}
}

func TestValidateTurnCredentials_WrongSecret(t *testing.T) {
	creds := GenerateTurnCredentials("room", "correctsecret", 30)

	// Validate with wrong secret should fail
	if ValidateTurnCredentials(creds.Username, creds.Password, "wrongsecret") {
		t.Error("Credentials with wrong secret should not validate")
	}
}

func TestValidateTurnCredentials_WrongPassword(t *testing.T) {
	secret := "secret"
	creds := GenerateTurnCredentials("room", secret, 30)

	// Validate with wrong password should fail
	if ValidateTurnCredentials(creds.Username, "wrongpassword", secret) {
		t.Error("Wrong password should not validate")
	}
}

func TestValidateTurnCredentials_MalformedUsername(t *testing.T) {
	tests := []struct {
		name     string
		username string
		password string
	}{
		{"no colon", "nocolon", "password"},
		{"empty username", "", "password"},
		{"only colon", ":", "password"},
		{"non-numeric timestamp", "abc:room", "password"},
		{"multiple colons", "123:room:extra", "password"}, // SplitN with 2 splits this correctly
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if ValidateTurnCredentials(tt.username, tt.password, "secret") {
				t.Errorf("Malformed username '%s' should not validate", tt.username)
			}
		})
	}
}

func TestValidateTurnCredentials_Expired(t *testing.T) {
	// Create credentials that are already expired
	// Format: timestamp:roomID
	// Use a timestamp in the past
	pastTime := time.Now().Add(-time.Hour).Unix() / 60
	username := fmt.Sprintf("%d:room123", pastTime)

	// Compute the correct password for this timestamp
	mac := hmac.New(sha256.New, []byte("secret"))
	mac.Write([]byte(username))
	password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	// Expired credentials should not validate
	if ValidateTurnCredentials(username, password, "secret") {
		t.Error("Expired credentials should not validate")
	}
}

func TestValidateTurnCredentials_EdgeExpiry(t *testing.T) {
	// Test credentials that expire in exactly 1 minute
	secret := "secret"
	creds := GenerateTurnCredentials("room", secret, 1)

	// Should still be valid
	if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
		t.Error("Credentials expiring in 1 minute should still be valid")
	}
}

func TestValidateTurnCredentials_EmptyInputs(t *testing.T) {
	tests := []struct {
		name     string
		username string
		password string
		secret   string
	}{
		{"empty username", "", "pass", "secret"},
		{"empty password", "user", "", "secret"},
		{"empty secret", "user", "pass", ""},
		{"all empty", "", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic, should return false
			ValidateTurnCredentials(tt.username, tt.password, tt.secret)
		})
	}
}

func TestValidateTurnCredentialsForAuth_Valid(t *testing.T) {
	secret := "testsecret"
	creds := GenerateTurnCredentials("room123", secret, 30)

	password, valid := ValidateTurnCredentialsForAuth(creds.Username, secret)

	if !valid {
		t.Error("Valid credentials should return valid=true")
	}

	if password == "" {
		t.Error("Password should not be empty for valid credentials")
	}

	// The returned password should match what we generated
	if password != creds.Password {
		t.Errorf("Returned password should match generated password")
	}
}

func TestValidateTurnCredentialsForAuth_WrongSecret(t *testing.T) {
	creds := GenerateTurnCredentials("room", "correctsecret", 30)

	// ValidateTurnCredentialsForAuth computes password with given secret
	// It returns true if timestamp is valid (even with "wrong" secret)
	// because it doesn't know what the "right" secret is - it just computes
	password, valid := ValidateTurnCredentialsForAuth(creds.Username, "wrongsecret")

	// The function returns valid=true because the timestamp is valid
	// The password returned will be different from the original
	if !valid {
		t.Error("Should validate because timestamp is valid")
	}

	if password == "" {
		t.Error("Password should be computed even with different secret")
	}

	// The passwords should be different since secrets differ
	if password == creds.Password {
		t.Error("Passwords should differ when secrets differ")
	}
}

func TestValidateTurnCredentialsForAuth_Expired(t *testing.T) {
	pastTime := time.Now().Add(-time.Hour).Unix() / 60
	username := fmt.Sprintf("%d:room", pastTime)

	password, valid := ValidateTurnCredentialsForAuth(username, "secret")

	if valid {
		t.Error("Expired credentials should not validate")
	}

	if password != "" {
		t.Error("Password should be empty for expired credentials")
	}
}

func TestValidateTurnCredentialsForAuth_MalformedUsername(t *testing.T) {
	tests := []struct {
		name     string
		username string
	}{
		{"no colon", "nocolon"},
		{"empty", ""},
		{"only timestamp", "12345"},
		{"non-numeric", "abc:room"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			password, valid := ValidateTurnCredentialsForAuth(tt.username, "secret")
			if valid {
				t.Errorf("Malformed username '%s' should not validate", tt.username)
			}
			if password != "" {
				t.Errorf("Password should be empty for invalid credentials")
			}
		})
	}
}

func TestComputeHMACPassword_Consistency(t *testing.T) {
	username := "testuser"
	secret := "testsecret"

	// Compute multiple times, should get same result
	pass1 := ComputeHMACPassword(username, secret)
	pass2 := ComputeHMACPassword(username, secret)

	if pass1 != pass2 {
		t.Error("HMAC password should be deterministic")
	}
}

func TestComputeHMACPassword_DifferentInputs(t *testing.T) {
	tests := []struct {
		name     string
		user1    string
		secret1  string
		user2    string
		secret2  string
		shouldBe bool
	}{
		{"same inputs", "user", "secret", "user", "secret", true},
		{"different user", "user1", "secret", "user2", "secret", false},
		{"different secret", "user", "secret1", "user", "secret2", false},
		{"both different", "user1", "secret1", "user2", "secret2", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pass1 := ComputeHMACPassword(tt.user1, tt.secret1)
			pass2 := ComputeHMACPassword(tt.user2, tt.secret2)

			same := pass1 == pass2
			if same != tt.shouldBe {
				t.Errorf("Expected same=%v, got same=%v", tt.shouldBe, same)
			}
		})
	}
}

func TestComputeHMACPassword_Base64Format(t *testing.T) {
	password := ComputeHMACPassword("user", "secret")

	// Should be valid base64
	decoded, err := base64.StdEncoding.DecodeString(password)
	if err != nil {
		t.Errorf("Password should be valid base64: %v", err)
	}

	// Decoded should be 32 bytes (SHA256 output)
	if len(decoded) != 32 {
		t.Errorf("Decoded password should be 32 bytes, got %d", len(decoded))
	}
}

// ============================================================================
// Lens 6: Mutation Chamber - Tests that catch implementation bugs
// ============================================================================

func TestGenerateTurnCredentials_MutationTTL(t *testing.T) {
	// Test that TTL actually affects the timestamp
	creds1 := GenerateTurnCredentials("room", "secret", 10)
	creds2 := GenerateTurnCredentials("room", "secret", 60)

	ts1, _ := strconv.ParseInt(strings.Split(creds1.Username, ":")[0], 10, 64)
	ts2, _ := strconv.ParseInt(strings.Split(creds2.Username, ":")[0], 10, 64)

	// Different TTLs should produce different timestamps
	// ts2 should be about 50 minutes ahead of ts1
	diff := ts2 - ts1
	if diff < 40 || diff > 60 { // Allow some tolerance for test execution time
		t.Errorf("Timestamp difference should be ~50 minutes, got %d", diff)
	}
}

func TestValidateTurnCredentials_HMACVerification(t *testing.T) {
	// Test that HMAC is actually verified (not just format check)
	secret := "secret"
	creds := GenerateTurnCredentials("room", secret, 30)

	// Correct password should validate
	if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
		t.Error("Correct password should validate")
	}

	// Slightly modified password should fail
	modifiedPassword := creds.Password + "x"
	if ValidateTurnCredentials(creds.Username, modifiedPassword, secret) {
		t.Error("Modified password should not validate")
	}

	// Completely wrong password should fail
	if ValidateTurnCredentials(creds.Username, "wrongpassword", secret) {
		t.Error("Wrong password should not validate")
	}
}

func TestTurnCredentials_UsernameContainsRoomID(t *testing.T) {
	// Test that the room ID is actually in the username
	roomID := "test-room-12345"
	creds := GenerateTurnCredentials(roomID, "secret", 30)

	if !strings.Contains(creds.Username, roomID) {
		t.Errorf("Username should contain room ID '%s', got '%s'", roomID, creds.Username)
	}
}

func TestValidateTurnCredentials_TimingSafeCompare(t *testing.T) {
	// This test verifies that we're using hmac.Equal (timing-safe comparison)
	// We can't directly test timing safety, but we can verify the function works
	secret := "secret"
	creds := GenerateTurnCredentials("room", secret, 30)

	// This should use hmac.Equal internally
	valid := ValidateTurnCredentials(creds.Username, creds.Password, secret)
	if !valid {
		t.Error("Validation should succeed")
	}

	// Wrong password of same length should fail
	wrongPass := base64.StdEncoding.EncodeToString([]byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
	if ValidateTurnCredentials(creds.Username, wrongPass, secret) {
		t.Error("Wrong password should fail even if same length")
	}
}

// ============================================================================
// Concurrency Tests
// ============================================================================

func TestGenerateTurnCredentials_Concurrent(t *testing.T) {
	secret := "secret"
	roomID := "room"
	ttl := 30

	// Generate credentials concurrently
	numGoroutines := 100
	results := make(chan TurnCredentials, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func() {
			creds := GenerateTurnCredentials(roomID, secret, ttl)
			results <- creds
		}()
	}

	// Collect results
	seen := make(map[string]bool)
	for i := 0; i < numGoroutines; i++ {
		creds := <-results

		// Validate each generated credential
		if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
			t.Error("Generated credential should be valid")
		}

		seen[creds.Username] = true
	}

	// All usernames should be the same (same timestamp minute)
	// But actually, they could differ if test crosses a minute boundary
	// So just verify all are valid
}

func TestValidateTurnCredentials_Concurrent(t *testing.T) {
	secret := "secret"
	creds := GenerateTurnCredentials("room", secret, 30)

	// Validate concurrently
	numGoroutines := 100
	results := make(chan bool, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func() {
			valid := ValidateTurnCredentials(creds.Username, creds.Password, secret)
			results <- valid
		}()
	}

	// All validations should succeed
	for i := 0; i < numGoroutines; i++ {
		if !<-results {
			t.Error("Concurrent validation should succeed")
		}
	}
}

// ============================================================================
// Unicode and Special Characters
// ============================================================================

func TestGenerateTurnCredentials_UnicodeRoomID(t *testing.T) {
	// Test with unicode characters in room ID
	roomID := "部屋-🔥-测试"
	secret := "secret"
	ttl := 30

	creds := GenerateTurnCredentials(roomID, secret, ttl)

	// Should generate valid credentials
	if creds.Username == "" || creds.Password == "" {
		t.Error("Should generate credentials with unicode room ID")
	}

	// Should validate
	if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
		t.Error("Credentials with unicode room ID should validate")
	}
}

func TestGenerateTurnCredentials_SpecialCharsInSecret(t *testing.T) {
	// Test with special characters in secret
	secret := "s3cr3t!@#$%^&*()_+-=[]{}|;':\",./<>?"
	roomID := "room"
	ttl := 30

	creds := GenerateTurnCredentials(roomID, secret, ttl)

	// Should generate valid credentials
	if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
		t.Error("Credentials with special char secret should validate")
	}
}

func TestGenerateTurnCredentials_EmptyRoomID(t *testing.T) {
	// Empty room ID should still work
	creds := GenerateTurnCredentials("", "secret", 30)

	// Username should have format "timestamp:"
	parts := strings.Split(creds.Username, ":")
	if len(parts) != 2 || parts[1] != "" {
		t.Errorf("Username should be 'timestamp:', got %s", creds.Username)
	}

	// Should still validate
	if !ValidateTurnCredentials(creds.Username, creds.Password, "secret") {
		t.Error("Credentials with empty room ID should validate")
	}
}

func TestGenerateTurnCredentials_VeryLongRoomID(t *testing.T) {
	// Very long room ID
	roomID := strings.Repeat("a", 1000)
	secret := "secret"
	ttl := 30

	creds := GenerateTurnCredentials(roomID, secret, ttl)

	// Should handle long room ID
	if !ValidateTurnCredentials(creds.Username, creds.Password, secret) {
		t.Error("Credentials with long room ID should validate")
	}
}
