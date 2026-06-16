package auth

import (
	"database/sql"
	"time"

	"github.com/google/uuid"

	"calendar/internal/db"
)

type User struct {
	ID           string
	Username     string
	PasswordHash string
	CreatedAt    string
}

type Session struct {
	ID        string
	UserID    string
	ExpiresAt string
}

// HasUsers checks if any user is registered.
func HasUsers() (bool, error) {
	var count int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count > 0, err
}

// Register creates the first user + default calendar + settings.
func Register(username, password string) (*User, error) {
	userID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	passwordHash, err := MakePasswordHash(password)
	if err != nil {
		return nil, err
	}

	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	// Insert user
	_, err = tx.Exec(
		"INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
		userID, username, passwordHash, now,
	)
	if err != nil {
		return nil, err
	}

	// Create default calendar
	calID := uuid.New().String()
	_, err = tx.Exec(
		`INSERT INTO calendars (id, name, color, source_type, owner_id, created_at, updated_at, last_modified)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		calID, "默认日历", "#3b82f6", "manual", userID, now, now, time.Now().UnixMilli(),
	)
	if err != nil {
		return nil, err
	}

	// Add calendar member (admin)
	_, err = tx.Exec(
		"INSERT INTO calendar_members (calendar_id, user_id, role, sort_order) VALUES (?, ?, ?, 0)",
		calID, userID, "admin",
	)
	if err != nil {
		return nil, err
	}

	// Create user settings
	_, err = tx.Exec(
		"INSERT INTO user_settings (user_id) VALUES (?)",
		userID,
	)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &User{ID: userID, Username: username, CreatedAt: now}, nil
}

// Login verifies credentials and creates a session.
func Login(username, password string, sessionDuration time.Duration) (*User, *Session, error) {
	var user User
	err := db.DB.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}

	if !VerifyPassword(password, user.PasswordHash) {
		return nil, nil, nil
	}

	sessionID, err := GenerateSessionID()
	if err != nil {
		return nil, nil, err
	}

	expiresAt := time.Now().UTC().Add(sessionDuration).Format(time.RFC3339)
	_, err = db.DB.Exec(
		"INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		sessionID, user.ID, expiresAt,
	)
	if err != nil {
		return nil, nil, err
	}

	return &user, &Session{ID: sessionID, UserID: user.ID, ExpiresAt: expiresAt}, nil
}

// ValidateSession checks if a session is valid and returns the user ID.
func ValidateSession(sessionID string) (string, error) {
	var userID, expiresAt string
	err := db.DB.QueryRow(
		"SELECT user_id, expires_at FROM sessions WHERE id = ?",
		sessionID,
	).Scan(&userID, &expiresAt)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	expiry, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		return "", nil
	}
	if time.Now().UTC().After(expiry) {
		_, _ = db.DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
		return "", nil
	}

	return userID, nil
}

// Logout deletes a session.
func Logout(sessionID string) error {
	_, err := db.DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

// ChangePassword verifies the old password and sets a new one.
func ChangePassword(userID, oldPassword, newPassword string) error {
	var passwordHash string
	err := db.DB.QueryRow(
		"SELECT password_hash FROM users WHERE id = ?", userID,
	).Scan(&passwordHash)
	if err != nil {
		return err
	}

	if !VerifyPassword(oldPassword, passwordHash) {
		return nil // will be handled by caller
	}

	newHash, err := MakePasswordHash(newPassword)
	if err != nil {
		return err
	}

	_, err = db.DB.Exec("UPDATE users SET password_hash = ? WHERE id = ?", newHash, userID)
	return err
}

// GetUserByID returns a user by ID.
func GetUserByID(userID string) (*User, error) {
	var user User
	err := db.DB.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
		userID,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &user, err
}

// IsUsernameTaken checks if a username is taken by another user.
func IsUsernameTaken(username, excludeUserID string) (bool, error) {
	var id string
	err := db.DB.QueryRow(
		"SELECT id FROM users WHERE username = ?", username,
	).Scan(&id)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return id != excludeUserID, nil
}

// ChangeUsername updates a user's username.
func ChangeUsername(userID, newUsername string) error {
	_, err := db.DB.Exec("UPDATE users SET username = ? WHERE id = ?", newUsername, userID)
	return err
}
