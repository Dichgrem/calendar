package middleware

import (
	"calendar/internal/logger"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"calendar/internal/apperror"
	"calendar/internal/db"

	"golang.org/x/crypto/pbkdf2"
)

type contextKey string

const (
	PermissionCtxKey contextKey = "permission"
	SessionIDCtxKey  contextKey = "sessionId"
)

// PermissionContext holds the authenticated user's permissions.
type PermissionContext struct {
	UserID string
	Roles  map[string]string // calendarID -> role
}

// RequireAuth is middleware that extracts the session from cookie/header,
// validates it, and injects PermissionContext into the request context.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionID := extractSession(r)
		perm, sid := resolveSession(sessionID)
		if perm == nil {
			writeAppError(w, apperror.Unauthorized("Not authenticated"))
			return
		}

		ctx := context.WithValue(r.Context(), PermissionCtxKey, perm)
		ctx = context.WithValue(ctx, SessionIDCtxKey, sid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext extracts the user ID from a context that has PermissionContext set.
func GetUserIDFromContext(ctx context.Context) string {
	if perm, ok := ctx.Value(PermissionCtxKey).(*PermissionContext); ok {
		return perm.UserID
	}
	return ""
}

// GetPermission extracts the PermissionContext from the request context.
func GetPermission(r *http.Request) *PermissionContext {
	if perm, ok := r.Context().Value(PermissionCtxKey).(*PermissionContext); ok {
		return perm
	}
	return nil
}

// GetSessionID extracts the session ID from the request context.
func GetSessionID(r *http.Request) string {
	if sid, ok := r.Context().Value(SessionIDCtxKey).(string); ok {
		return sid
	}
	return ""
}

// RoleGte checks if role >= min (viewer < editor < admin).
func RoleGte(role, min string) bool {
	rank := map[string]int{"viewer": 0, "editor": 1, "admin": 2}
	return rank[role] >= rank[min]
}

// RequireRole returns true if the permission context has the required role for a calendar.
func (p *PermissionContext) RequireRole(calendarID, minRole string) bool {
	role, ok := p.Roles[calendarID]
	if !ok {
		return false
	}
	return RoleGte(role, minRole)
}

// IsMember returns true if the user is a member of the calendar.
func (p *PermissionContext) IsMember(calendarID string) bool {
	_, ok := p.Roles[calendarID]
	return ok
}

// ErrorHandler is middleware that recovers from panics and formats errors.
func ErrorHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logger.Info("PANIC: %v", rec)
				writeAppError(w, apperror.Internal("Internal server error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// JSONResponse writes a standard { ok: true, data: ... } response.
func JSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":   true,
		"data": data,
	})
}

// WriteAppError writes a standard { ok: false, error: ... } response.
func WriteAppError(w http.ResponseWriter, err *apperror.AppError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Code)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":    false,
		"error": map[string]string{"code": err.ErrCode, "message": err.Message},
	})
}

func writeAppError(w http.ResponseWriter, err *apperror.AppError) {
	WriteAppError(w, err)
}

func extractSession(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")

	// 1. Bearer token
	if strings.HasPrefix(authHeader, "Bearer ") {
		return authHeader[7:]
	}

	// 2. Basic auth (for CalDAV clients like DAVx5)
	if strings.HasPrefix(authHeader, "Basic ") {
		userID := resolveBasicAuth(authHeader[6:])
		if userID != "" {
			return "u:" + userID // virtual session: prefix "u:" marks direct auth
		}
	}

	// 3. session_token cookie
	if cookie, err := r.Cookie("session_token"); err == nil {
		return cookie.Value
	}

	return ""
}

func resolveBasicAuth(encoded string) string {
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return ""
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return ""
	}
	username, password := parts[0], parts[1]
	return verifyUserPassword(username, password)
}

func verifyUserPassword(username, password string) string {
	var id, hash string
	err := db.DB.QueryRow("SELECT id, password_hash FROM users WHERE username = ?", username).Scan(&id, &hash)
	if err != nil {
		return ""
	}
	if !verifyHash(password, hash) {
		return ""
	}
	return id
}

func verifyHash(password, stored string) bool {
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return false
	}
	hash, salt := parts[0], parts[1]
	input := hex.EncodeToString(pbkdf2.Key([]byte(password), []byte(salt), 100_000, 32, sha256.New))
	return subtle.ConstantTimeCompare([]byte(hash), []byte(input)) == 1
}

func resolveSession(sessionID string) (*PermissionContext, string) {
	if sessionID == "" {
		return nil, ""
	}

	// Virtual sessions from Basic Auth: prefix "u:<userID>"
	if strings.HasPrefix(sessionID, "u:") {
		userID := sessionID[2:]
		roles, err := loadRoles(userID)
		if err != nil {
			logger.Info("Failed to load roles: %v", err)
			return nil, ""
		}
		return &PermissionContext{UserID: userID, Roles: roles}, sessionID
	}

	userID := validateSession(sessionID)
	if userID == "" {
		return nil, ""
	}

	roles, err := loadRoles(userID)
	if err != nil {
		logger.Info("Failed to load roles: %v", err)
		return nil, ""
	}

	return &PermissionContext{UserID: userID, Roles: roles}, sessionID
}

func validateSession(sessionID string) string {
	var userID, expiresAt string
	err := db.DB.QueryRow(
		"SELECT user_id, expires_at FROM sessions WHERE id = ?",
		sessionID,
	).Scan(&userID, &expiresAt)
	if err != nil {
		return ""
	}

	expiry, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil || time.Now().UTC().After(expiry) {
		_, _ = db.DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
		return ""
	}

	return userID
}

func loadRoles(userID string) (map[string]string, error) {
	rows, err := db.DB.Query(
		"SELECT calendar_id, role FROM calendar_members WHERE user_id = ?",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	roles := make(map[string]string)
	for rows.Next() {
		var calID, role string
		if err := rows.Scan(&calID, &role); err != nil {
			return nil, err
		}
		roles[calID] = role
	}
	return roles, rows.Err()
}

// SecurityHeaders adds recommended HTTP security headers.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'")
		if r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// CORS is middleware for Capacitor WebView cross-origin requests.
// Only allows known whitelisted origins (localhost / capacitor scheme).
func CORS(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"http://localhost":      true, // Capacitor WebView
		"https://localhost":     true,
		"capacitor://localhost": true, // Capacitor scheme
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS, PROPFIND, REPORT, MKCALENDAR, PUT")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Depth, Prefer")
			// Only short-circuit for actual CORS preflight
			if r.Method == "OPTIONS" {
				w.WriteHeader(204)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// CaldavAuth is middleware for CalDAV routes that allows unauthenticated
// service discovery while rejecting unauthorized access with proper
// WWW-Authenticate headers that DAV clients expect.
func CaldavAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to authenticate
		sessionID := extractSession(r)
		if sessionID != "" {
			perm, sid := resolveSession(sessionID)
			if perm != nil {
				ctx := context.WithValue(r.Context(), PermissionCtxKey, perm)
				ctx = context.WithValue(ctx, SessionIDCtxKey, sid)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// Not authenticated — return 401 with DAV challenge
		w.Header().Set("WWW-Authenticate", `Basic realm="Calendar"`)
		w.WriteHeader(401)
	})
}
