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
	PBKDF2Iterations  = 600_000
	PBKDF2KeyLen      = 32 // SHA-256 output
)

// HashPassword returns PBKDF2(password, salt) as hex.
// Uses the given iteration count (PBKDF2 SHA-256, 32-byte output).
func hashPassword(password, salt string, iterations int) string {
	hash := pbkdf2.Key([]byte(password), []byte(salt), iterations, PBKDF2KeyLen, sha256.New)
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

// MakePasswordHash produces the stored format: "<hash>:<salt>:<iterations>".
// New users use PBKDF2Iterations; existing old-format hashes default to 100k.
func MakePasswordHash(password string) (string, error) {
	salt, err := GenerateSalt()
	if err != nil {
		return "", err
	}
	hash := hashPassword(password, salt, PBKDF2Iterations)
	return fmt.Sprintf("%s:%s:%d", hash, salt, PBKDF2Iterations), nil
}

// VerifyPassword checks a password against the stored string.
// Format: "hash:salt" (old, 100k iters) or "hash:salt:iterations" (new).
func VerifyPassword(password, stored string) bool {
	parts := strings.SplitN(stored, ":", 3)
	var hash, salt string
	iterations := 100_000 // default for old format
	if len(parts) == 3 {
		hash, salt = parts[0], parts[1]
		if n, err := fmt.Sscanf(parts[2], "%d", &iterations); n != 1 || err != nil {
			return false
		}
	} else if len(parts) == 2 {
		hash, salt = parts[0], parts[1]
	} else {
		return false
	}
	input := hashPassword(password, salt, iterations)
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
