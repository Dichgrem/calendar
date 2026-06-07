package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const (
	SessionTokenBytes = 32 // 64 hex chars
	SaltBytes         = 16 // 32 hex chars
	PBKDF2Iterations  = 100_000
	PBKDF2KeyLen      = 32 // SHA-256 output
)

// HashPassword returns PBKDF2(password, salt) as hex.
// Parameters match the existing Node.js implementation:
// PBKDF2 SHA-256, 100,000 iterations, 32-byte output.
func HashPassword(password, salt string) string {
	hash := pbkdf2.Key([]byte(password), []byte(salt), PBKDF2Iterations, PBKDF2KeyLen, sha256.New)
	return hex.EncodeToString(hash)
}

// GenerateSalt creates a random 16-byte salt as hex.
func GenerateSalt() (string, error) {
	b := make([]byte, SaltBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// MakePasswordHash produces the stored format: "<hash>:<salt>".
func MakePasswordHash(password string) (string, error) {
	salt, err := GenerateSalt()
	if err != nil {
		return "", err
	}
	hash := HashPassword(password, salt)
	return fmt.Sprintf("%s:%s", hash, salt), nil
}

// VerifyPassword checks a password against the stored hash:salt.
func VerifyPassword(password, stored string) bool {
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return false
	}
	hash, salt := parts[0], parts[1]
	input := HashPassword(password, salt)
	return subtle.ConstantTimeCompare([]byte(hash), []byte(input)) == 1
}

// GenerateSessionID creates a random session token.
func GenerateSessionID() (string, error) {
	b := make([]byte, SessionTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
