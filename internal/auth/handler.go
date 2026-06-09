package auth

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/config"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
)

// RegisterRoutes adds public auth routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Get("/api/auth/status", handleStatus)
	r.Post("/api/auth/register", handleRegister)
	r.Post("/api/auth/login", handleLogin)
	r.Post("/api/auth/logout", handleLogout)
}

// RegisterProtectedRoutes adds auth routes that require authentication.
func RegisterProtectedRoutes(r chi.Router) {
	r.Get("/api/auth/me", HandleMe)
	r.Get("/api/auth/token", HandleToken)
	r.Post("/api/auth/change-password", HandleChangePassword)
	r.Post("/api/auth/change-username", HandleChangeUsername)
}

const sessionCookie = "session_token"

func handleStatus(w http.ResponseWriter, r *http.Request) {
	exists, err := HasUsers()
	if err != nil {
		middleware.WriteAppError(w, apperror.Internal("Database error"))
		return
	}
	middleware.JSONResponse(w, 200, map[string]bool{"registered": exists})
}

type registerRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func handleRegister(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[auth] POST /api/auth/register")
	exists, err := HasUsers()
	if err != nil {
		middleware.WriteAppError(w, apperror.Internal("Database error"))
		return
	}
	if exists {
		middleware.WriteAppError(w, apperror.Forbidden("User already exists"))
		return
	}

	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if len(req.Username) < 1 || len(req.Username) > 100 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Username must be 1-100 characters"))
		return
	}
	if len(req.Password) < 4 || len(req.Password) > 200 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Password must be 4-200 characters"))
		return
	}

	user, err := Register(req.Username, req.Password)
	if err != nil {
		logger.Error("[auth] register user=%q error: %v", req.Username, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Registration failed"))
		return
	}

	// Auto-login after register
	cfg := config.Load()
	_, session, err := Login(req.Username, req.Password, cfg.SessionDuration)
	if err != nil || session == nil {
		middleware.JSONResponse(w, 201, map[string]string{"userId": user.ID})
		return
	}

	logger.Info("[auth] register user=%q success", req.Username)
	setSessionCookie(w, session.ID, cfg.SessionDuration, cfg.SecureCookies)
	middleware.JSONResponse(w, 201, map[string]string{"userId": user.ID})
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[auth] POST /api/auth/login")
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.Username == "" || req.Password == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Username and password required"))
		return
	}

	cfg := config.Load()
	user, session, err := Login(req.Username, req.Password, cfg.SessionDuration)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Login failed"))
		return
	}
	if session == nil {
		logger.Info("[auth] login user=%q invalid credentials", req.Username)
		middleware.JSONResponse(w, 401, apperror.Unauthorized("Invalid credentials"))
		return
	}

	logger.Info("[auth] login user=%q success", req.Username)
	setSessionCookie(w, session.ID, cfg.SessionDuration, cfg.SecureCookies)
	middleware.JSONResponse(w, 200, map[string]string{
		"userId":    user.ID,
		"sessionId": session.ID,
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[auth] POST /api/auth/logout")
	sessionID := extractSessionToken(r)
	if sessionID != "" {
		Logout(sessionID)
	}
	cfg := config.Load()
	clearSessionCookie(w, cfg.SecureCookies)
	middleware.JSONResponse(w, 200, nil)
}

// extractSessionToken mirrors middleware.extractSession but is used
// in unauthenticated routes (logout) that need to find the active session.
func extractSessionToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return authHeader[7:]
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		return cookie.Value
	}
	return ""
}

func HandleMe(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	user, err := GetUserByID(perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	middleware.JSONResponse(w, 200, map[string]string{
		"userId":   user.ID,
		"username": user.Username,
	})
}

func HandleToken(w http.ResponseWriter, r *http.Request) {
	sessionID := middleware.GetSessionID(r)
	middleware.JSONResponse(w, 200, map[string]string{"token": sessionID})
}

type changePasswordRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

func HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	logger.Debug("[auth] POST /api/auth/change-password user=%s", perm.UserID)

	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.OldPassword == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("oldPassword is required"))
		return
	}
	if len(req.NewPassword) < 4 || len(req.NewPassword) > 200 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("New password must be 4-200 characters"))
		return
	}

	// Verify old password first
	var passwordHash string
	err := db.DB.QueryRow(
		"SELECT password_hash FROM users WHERE id = ?", perm.UserID,
	).Scan(&passwordHash)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	if !VerifyPassword(req.OldPassword, passwordHash) {
		logger.Info("[auth] change-password user=%s old-password mismatch", perm.UserID)
		middleware.JSONResponse(w, 401, apperror.Unauthorized("Invalid old password"))
		return
	}

	// Set new password
	newHash, err := MakePasswordHash(req.NewPassword)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Password hashing failed"))
		return
	}
	_, err = db.DB.Exec("UPDATE users SET password_hash = ? WHERE id = ?", newHash, perm.UserID)
	if err != nil {
		logger.Error("[auth] change-password user=%s db error: %v", perm.UserID, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	logger.Info("[auth] change-password user=%s success", perm.UserID)
	middleware.JSONResponse(w, 200, nil)
}

type changeUsernameRequest struct {
	Username string `json:"username"`
}

func HandleChangeUsername(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	logger.Debug("[auth] POST /api/auth/change-username user=%s", perm.UserID)

	var req changeUsernameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if len(req.Username) < 1 || len(req.Username) > 50 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Username must be 1-50 characters"))
		return
	}

	taken, err := IsUsernameTaken(req.Username, perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	if taken {
		middleware.JSONResponse(w, 409, apperror.Conflict("Username already taken"))
		return
	}

	if err := ChangeUsername(perm.UserID, req.Username); err != nil {
		logger.Error("[auth] change-username user=%s to=%q error: %v", perm.UserID, req.Username, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	logger.Info("[auth] change-username user=%s to=%q success", perm.UserID, req.Username)
	middleware.JSONResponse(w, 200, nil)
}

// cookie helpers

func setSessionCookie(w http.ResponseWriter, sessionID string, duration time.Duration, secure bool) {
	maxAge := int(duration.Seconds())
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode // cross-origin APK needs None
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: sameSite,
		Secure:   secure,
		MaxAge:   maxAge,
	})
}

func clearSessionCookie(w http.ResponseWriter, secure bool) {
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: sameSite,
		Secure:   secure,
		MaxAge:   -1,
	})
}
