package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// LocalCertDir is the directory where local mode certificates are stored
const LocalCertDir = "local_certs"

// LocalCert holds the generated certificate and key
type LocalCert struct {
	CertFile string
	KeyFile  string
}

// GenerateLocalCert creates a self-signed certificate for local development
// The certificate is valid for localhost, 127.0.0.1, and the provided local IP
func GenerateLocalCert(localIP string) (*LocalCert, error) {
	// Create cert directory if it doesn't exist
	if err := os.MkdirAll(LocalCertDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create cert directory: %w", err)
	}

	certFile := filepath.Join(LocalCertDir, "cert.pem")
	keyFile := filepath.Join(LocalCertDir, "key.pem")

	// Check if certs already exist and are still valid
	if cert, err := loadExistingCert(certFile, keyFile); err == nil {
		// Check if cert covers the local IP
		for _, name := range cert.DNSNames {
			if name == localIP {
				return &LocalCert{CertFile: certFile, KeyFile: keyFile}, nil
			}
		}
		// Also check IP addresses
		for _, ip := range cert.IPAddresses {
			if ip.String() == localIP {
				return &LocalCert{CertFile: certFile, KeyFile: keyFile}, nil
			}
		}
	}

	// Generate new private key
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Parse the local IP
	ip := net.ParseIP(localIP)
	if ip == nil {
		return nil, fmt.Errorf("invalid IP address: %s", localIP)
	}

	// Certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"VideoChat Local Dev"},
			CommonName:   "VideoChat Local",
		},
		NotBefore: time.Now(),
		NotAfter:  time.Now().Add(365 * 24 * time.Hour), // 1 year validity

		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,

		DNSNames: []string{
			"localhost",
			localIP, // Include IP as DNS name for broader compatibility
		},
		IPAddresses: []net.IP{
			net.IPv4(127, 0, 0, 1),
			net.IPv6loopback,
			ip,
		},
	}

	// Create the certificate
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return nil, fmt.Errorf("failed to create certificate: %w", err)
	}

	// Write certificate
	certOut, err := os.Create(certFile)
	if err != nil {
		return nil, fmt.Errorf("failed to open cert file: %w", err)
	}
	defer certOut.Close()

	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		return nil, fmt.Errorf("failed to write cert: %w", err)
	}

	// Write private key
	keyOut, err := os.OpenFile(keyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return nil, fmt.Errorf("failed to open key file: %w", err)
	}
	defer keyOut.Close()

	privBytes, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal private key: %w", err)
	}

	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: privBytes}); err != nil {
		return nil, fmt.Errorf("failed to write key: %w", err)
	}

	return &LocalCert{CertFile: certFile, KeyFile: keyFile}, nil
}

// loadExistingCert loads an existing certificate and returns it if valid
func loadExistingCert(certFile, keyFile string) (*x509.Certificate, error) {
	// Check if files exist
	if _, err := os.Stat(certFile); os.IsNotExist(err) {
		return nil, err
	}
	if _, err := os.Stat(keyFile); os.IsNotExist(err) {
		return nil, err
	}

	// Read certificate
	certPEM, err := os.ReadFile(certFile)
	if err != nil {
		return nil, err
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("failed to decode certificate PEM")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}

	// Check if certificate is still valid
	if time.Now().After(cert.NotAfter) {
		return nil, fmt.Errorf("certificate has expired")
	}

	return cert, nil
}
