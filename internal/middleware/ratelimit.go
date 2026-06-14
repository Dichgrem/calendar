package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiterConfig defines per-endpoint rate limiting rules.
type RateLimiterConfig struct {
	Limit  rate.Limit // requests per second (use rate.Every(interval))
	Burst  int        // maximum burst size
	Action string     // identifier for logging
}

// Default rate limit configurations.
var (
	LimitLogin          = RateLimiterConfig{Limit: rate.Every(12 * time.Second), Burst: 5, Action: "login"}
	LimitRegister       = RateLimiterConfig{Limit: rate.Every(20 * time.Minute), Burst: 3, Action: "register"}
	LimitPasswordChange = RateLimiterConfig{Limit: rate.Every(6 * time.Second), Burst: 10, Action: "change-password"}
	LimitUsernameChange = RateLimiterConfig{Limit: rate.Every(6 * time.Second), Burst: 10, Action: "change-username"}
)

// Path to rate limit config mapping.
var pathLimits = map[string]RateLimiterConfig{
	"/api/auth/login":           LimitLogin,
	"/api/auth/register":        LimitRegister,
	"/api/auth/change-password": LimitPasswordChange,
	"/api/auth/change-username": LimitUsernameChange,
}

// rateLimiterEntry wraps a rate limiter with its last-access time for cleanup.
type rateLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiterMap stores per-IP rate limiters with periodic cleanup.
type rateLimiterMap struct {
	mu       sync.Mutex
	entries  map[string]*rateLimiterEntry
	stopCh   chan struct{}
	stopOnce sync.Once
}

var globalLimiterMap = newRateLimiterMap()

func newRateLimiterMap() *rateLimiterMap {
	m := &rateLimiterMap{
		entries: make(map[string]*rateLimiterEntry),
		stopCh:  make(chan struct{}),
	}
	go m.cleanupLoop()
	return m
}

func (m *rateLimiterMap) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			m.cleanupStale()
		case <-m.stopCh:
			return
		}
	}
}

func (m *rateLimiterMap) cleanupStale() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for ip, entry := range m.entries {
		if now.Sub(entry.lastSeen) > 30*time.Minute {
			delete(m.entries, ip)
		}
	}
}

// getOrCreate returns the rate limiter for the given IP, creating one if needed.
func (m *rateLimiterMap) getOrCreate(ip string, limit rate.Limit, burst int) *rate.Limiter {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, exists := m.entries[ip]
	if !exists {
		entry = &rateLimiterEntry{
			limiter: rate.NewLimiter(limit, burst),
		}
		m.entries[ip] = entry
	}
	entry.lastSeen = time.Now()
	return entry.limiter
}

// RateLimitByAction is a Chi middleware that applies per-IP rate limiting
// based on the request path. Limited endpoints return 429 Too Many Requests.
func RateLimitByAction(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		config, ok := pathLimits[r.URL.Path]
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}

		limiter := globalLimiterMap.getOrCreate(ip, config.Limit, config.Burst)
		if !limiter.Allow() {
			http.Error(w, `{"error":{"code":"RATE_LIMITED","message":"Too many requests"}}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
