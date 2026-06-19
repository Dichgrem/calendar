package backup

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
)

const DefaultBackupDir = "backups"

func backupDir() string {
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return filepath.Join(filepath.Dir(dbURL), "backups")
	}
	return DefaultBackupDir
}

// RegisterRoutes adds backup routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Post("/api/backup", handleCreate)
	r.Get("/api/backups", handleList)
	r.Get("/api/backup/download/{filename}", handleDownload)
	r.Post("/api/backup/restore", handleRestore)
}

type backupInfo struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Created  string `json:"created"`
}

func handleCreate(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[backup] POST create")
	if !isInstanceAdmin(r) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Admin only"))
		return
	}
	if err := os.MkdirAll(backupDir(), 0o700); err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Cannot create backup directory"))
		return
	}

	// Force WAL checkpoint so the main db file is self-contained
	if _, err := db.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		logger.Error("backup checkpoint warning: %v", err)
	}

	ts := time.Now().UTC().Format("2006-01-02T150405Z")
	filename := fmt.Sprintf("calendar-%s.db", ts)
	dest := filepath.Join(backupDir(), filename)

	src, err := os.Open(db.Path)
	if err != nil {
		logger.Error("backup open source: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Backup failed"))
		return
	}
	defer func() { _ = src.Close() }()

	dst, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		logger.Error("backup create dest: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Backup failed"))
		return
	}
	defer func() { _ = dst.Close() }()

	if _, err := io.Copy(dst, src); err != nil {
		logger.Error("backup copy: %v", err)
		_ = os.Remove(dest)
		middleware.JSONResponse(w, 500, apperror.Internal("Backup failed"))
		return
	}

	logger.Info("[backup] created %s", filename)
	middleware.JSONResponse(w, 201, map[string]string{"filename": filename})
}

func handleList(w http.ResponseWriter, r *http.Request) {
	if !isInstanceAdmin(r) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Admin only"))
		return
	}
	entries, err := os.ReadDir(backupDir())
	if err != nil {
		if os.IsNotExist(err) {
			middleware.JSONResponse(w, 200, []backupInfo{})
			return
		}
		middleware.JSONResponse(w, 500, apperror.Internal("Cannot list backups"))
		return
	}

	var backups []backupInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		backups = append(backups, backupInfo{
			Filename: e.Name(),
			Size:     info.Size(),
			Created:  info.ModTime().UTC().Format(time.RFC3339),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Created > backups[j].Created
	})

	middleware.JSONResponse(w, 200, backups)
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if !isInstanceAdmin(r) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Admin only"))
		return
	}

	// Path traversal protection
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") ||
		strings.Contains(filename, "..") || !strings.HasSuffix(filename, ".db") {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid filename"))
		return
	}

	path := filepath.Join(backupDir(), filename)
	if _, err := os.Stat(path); err != nil {
		middleware.JSONResponse(w, 404, apperror.NotFound("Backup not found"))
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, path)
}

func handleRestore(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[backup] POST restore")
	if !isInstanceAdmin(r) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Admin only"))
		return
	}
	var req struct {
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	// Path traversal protection
	if strings.Contains(req.Filename, "/") || strings.Contains(req.Filename, "\\") ||
		strings.Contains(req.Filename, "..") || !strings.HasSuffix(req.Filename, ".db") {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid filename"))
		return
	}

	src := filepath.Join(backupDir(), req.Filename)
	if _, err := os.Stat(src); err != nil {
		middleware.JSONResponse(w, 404, apperror.NotFound("Backup not found"))
		return
	}

	// Copy backup to a temp file, then atomically rename over the live DB.
	// This prevents data loss if the process crashes mid-copy.
	srcFile, err := os.Open(src)
	if err != nil {
		logger.Error("restore open backup: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}
	defer func() { _ = srcFile.Close() }()

	tmpPath := db.Path + ".tmp"
	dstFile, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		logger.Error("restore create temp: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}
	defer func() { _ = dstFile.Close() }()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		logger.Error("restore copy: %v", err)
		_ = os.Remove(tmpPath)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}

	if err := dstFile.Close(); err != nil {
		logger.Error("restore close temp: %v", err)
		_ = os.Remove(tmpPath)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}

	if err := os.Rename(tmpPath, db.Path); err != nil {
		logger.Error("restore rename: %v", err)
		_ = os.Remove(tmpPath)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}

	logger.Info("[backup] restore from %s success", req.Filename)
	middleware.JSONResponse(w, 200, map[string]string{
		"message": "Restored. The server will use the new data after restart.",
	})
}

// isInstanceAdmin returns true if the authenticated user is the first (admin) user.
func isInstanceAdmin(r *http.Request) bool {
	perm := middleware.GetPermission(r)
	if perm == nil {
		return false
	}
	// The instance admin is the user with the earliest created_at.
	var adminID string
	_ = db.DB.QueryRow("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").Scan(&adminID)
	return adminID == perm.UserID
}
