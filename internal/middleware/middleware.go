package middleware

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"calendar/internal/apperror"
	"calendar/internal/db"
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
				log.Printf("PANIC: %v", rec)
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
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":   true,
		"data": data,
	})
}

// WriteAppError writes a standard { ok: false, error: ... } response.
func WriteAppError(w http.ResponseWriter, err *apperror.AppError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":    false,
		"error": map[string]string{"code": err.ErrCode, "message": err.Message},
	})
}

func writeAppError(w http.ResponseWriter, err *apperror.AppError) {
	WriteAppError(w, err)
}

func extractSession(r *http.Request) string {
	// 1. Authorization: Bearer <token>
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return authHeader[7:]
	}

	// 2. session_token cookie
	if cookie, err := r.Cookie("session_token"); err == nil {
		return cookie.Value
	}

	return ""
}

func resolveSession(sessionID string) (*PermissionContext, string) {
	if sessionID == "" {
		return nil, ""
	}

	userID := validateSession(sessionID)
	if userID == "" {
		return nil, ""
	}

	roles, err := loadRoles(userID)
	if err != nil {
		log.Printf("Failed to load roles: %v", err)
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
		db.DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
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
	defer rows.Close()

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
		next.ServeHTTP(w, r)
	})
}
