package middleware

import (
	"golang.org/x/time/rate"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestRateLimiterMapGetOrCreate(t *testing.T) {
	m := newRateLimiterMap()
	defer m.stop()

	lim1 := m.getOrCreate("192.168.1.1", rate.Every(time.Second), 5)
	lim2 := m.getOrCreate("192.168.1.1", rate.Every(time.Hour), 10)

	// Same IP should return the SAME limiter (first seen config wins).
	if lim1 != lim2 {
		t.Errorf("expected same limiter for same IP")
	}
}

func TestRateLimiterMapCleanupStale(t *testing.T) {
	m := newRateLimiterMap()
	defer m.stop()

	m.getOrCreate("10.0.0.1", rate.Every(time.Minute), 3)
	_, exists := m.entries["10.0.0.1"]
	if !exists {
		t.Fatal("expected entry to exist")
	}

	// Simulate aging
	m.mu.Lock()
	m.entries["10.0.0.1"].lastSeen = time.Now().Add(-40 * time.Minute)
	m.mu.Unlock()

	m.cleanupStale()

	m.mu.Lock()
	_, exists = m.entries["10.0.0.1"]
	m.mu.Unlock()
	if exists {
		t.Error("expected stale entry to be removed")
	}
}

func TestRateLimiterMapConcurrent(t *testing.T) {
	m := newRateLimiterMap()
	defer m.stop()

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				m.getOrCreate("10.0.0.2", rate.Every(time.Second), 5)
			}
		}()
	}
	wg.Wait()

	m.mu.Lock()
	_, exists := m.entries["10.0.0.2"]
	m.mu.Unlock()
	if !exists {
		t.Error("expected entry to exist after concurrent access")
	}
}

func (m *rateLimiterMap) stop() {
	m.stopOnce.Do(func() {
		close(m.stopCh)
	})
}

func TestRateLimitByActionLogin(t *testing.T) {
	handler := RateLimitByAction(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Send 6 requests to login endpoint (burst is 5)
	for i := 0; i < 6; i++ {
		req := httptest.NewRequest("POST", "/api/auth/login", nil)
		req.RemoteAddr = "192.168.1.99:12345"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if i < 5 {
			if w.Code != http.StatusOK {
				t.Errorf("request %d: expected 200, got %d", i, w.Code)
			}
		} else {
			if w.Code != http.StatusTooManyRequests {
				t.Errorf("request %d: expected 429, got %d", i, w.Code)
			}
		}
	}
}

func TestRateLimitByActionUnlimited(t *testing.T) {
	handler := RateLimitByAction(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// /api/health is not rate-limited
	for i := 0; i < 20; i++ {
		req := httptest.NewRequest("GET", "/api/health", nil)
		req.RemoteAddr = "192.168.1.99:12345"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("request %d to health: expected 200, got %d", i, w.Code)
		}
	}
}

func TestRateLimitByActionRegister(t *testing.T) {
	handler := RateLimitByAction(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// 4 requests to register endpoint (burst is 3)
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest("POST", "/api/auth/register", nil)
		req.RemoteAddr = "10.0.0.8:9999"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if i < 3 {
			if w.Code != http.StatusOK {
				t.Errorf("request %d: expected 200, got %d", i, w.Code)
			}
		} else {
			if w.Code != http.StatusTooManyRequests {
				t.Errorf("request %d: expected 429, got %d", i, w.Code)
			}
		}
	}
}

func TestRateLimitByActionDifferentIPs(t *testing.T) {
	handler := RateLimitByAction(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Two IPs, each sending up to their burst limit
	req1 := httptest.NewRequest("POST", "/api/auth/login", nil)
	req1.RemoteAddr = "10.0.0.1:1"
	req2 := httptest.NewRequest("POST", "/api/auth/login", nil)
	req2.RemoteAddr = "10.0.0.2:1"

	for i := 0; i < 6; i++ {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req1)
		if i < 5 && w.Code != http.StatusOK {
			t.Errorf("IP1 request %d: expected 200, got %d", i, w.Code)
		}
	}
	// IP1 is now rate-limited

	for i := 0; i < 5; i++ {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req2)
		if w.Code != http.StatusOK {
			t.Errorf("IP2 request %d: expected 200, got %d", i, w.Code)
		}
	}
	// IP2 should still be OK
}
