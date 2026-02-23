package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// TurnCredentials holds short-lived TURN credentials
type TurnCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// GenerateTurnCredentials creates short-lived TURN credentials using HMAC-SHA256
func GenerateTurnCredentials(roomID, secret string, ttlMinutes int) TurnCredentials {
	// Timestamp in minutes since epoch (TURN credential format)
	timestamp := time.Now().Add(time.Duration(ttlMinutes)*time.Minute).Unix() / 60
	username := fmt.Sprintf("%d:%s", timestamp, roomID)

	// Generate HMAC-SHA256 of username with secret
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(username))
	password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return TurnCredentials{
		Username: username,
		Password: password,
	}
}

// ValidateTurnCredentials verifies TURN credentials
func ValidateTurnCredentials(username, password, secret string) bool {
	// Parse username: format is "timestamp:roomID"
	parts := strings.SplitN(username, ":", 2)
	if len(parts) != 2 {
		return false
	}

	timestampStr := parts[0]
	timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil {
		return false
	}

	// Check if credential has expired (timestamp is in minutes)
	if timestamp < time.Now().Unix()/60 {
		return false
	}

	// Verify HMAC
	// Regenerate with the exact same timestamp
	expectedUsername := fmt.Sprintf("%d:%s", timestamp, parts[1])
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(expectedUsername))
	expectedPassword := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(password), []byte(expectedPassword))
}

// ComputeHMACPassword computes the HMAC-SHA256 password for a given username and secret
func ComputeHMACPassword(username, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(username))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// ValidateTurnCredentialsForAuth validates credentials without checking password
// Returns the expected password if the timestamp is valid
func ValidateTurnCredentialsForAuth(username, secret string) (string, bool) {
	// Parse username: format is "timestamp:roomID"
	parts := strings.SplitN(username, ":", 2)
	if len(parts) != 2 {
		return "", false
	}

	timestampStr := parts[0]
	timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil {
		return "", false
	}

	// Check if credential has expired (timestamp is in minutes)
	if timestamp < time.Now().Unix()/60 {
		return "", false
	}

	// Return the expected password
	expectedPassword := ComputeHMACPassword(username, secret)
	return expectedPassword, true
}
