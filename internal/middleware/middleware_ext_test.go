package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	headers := []string{"X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Content-Security-Policy"}
	for _, h := range headers {
		if w.Header().Get(h) == "" {
			t.Errorf("missing header: %s", h)
		}
	}
	if w.Header().Get("X-Frame-Options") != "DENY" {
		t.Errorf("X-Frame-Options: %s", w.Header().Get("X-Frame-Options"))
	}
}

func TestCORSLocalhostAllowed(t *testing.T) {
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost" {
		t.Errorf("localhost origin not allowed: %s", w.Header().Get("Access-Control-Allow-Origin"))
	}
	if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Error("credentials should be allowed for whitelisted origin")
	}
}

func TestCORSExternalOriginBlocked(t *testing.T) {
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("external origin should NOT get Allow-Origin: %s", w.Header().Get("Access-Control-Allow-Origin"))
	}
	if w.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Error("credentials should NOT be allowed for unknown origin")
	}
}

func TestCORSOptionsPreflight(t *testing.T) {
	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called for OPTIONS")
	}))

	req := httptest.NewRequest("OPTIONS", "/", nil)
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != 204 {
		t.Errorf("OPTIONS preflight should return 204, got %d", w.Code)
	}
}

func TestExtractSessionCookie(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: "abc123"})
	if got := extractSession(req); got != "abc123" {
		t.Errorf("extractSession cookie: %q", got)
	}
}

func TestExtractSessionBearer(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer token-xyz")
	if got := extractSession(req); got != "token-xyz" {
		t.Errorf("extractSession bearer: %q", got)
	}
}

func TestExtractSessionEmpty(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	if got := extractSession(req); got != "" {
		t.Errorf("extractSession empty: %q", got)
	}
}
