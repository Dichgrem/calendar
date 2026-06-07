package backup

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/middleware"
)

const backupDir = "backups"

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
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Cannot create backup directory"))
		return
	}

	// Force WAL checkpoint so the main db file is self-contained
	if _, err := db.DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		log.Printf("backup checkpoint warning: %v", err)
	}

	ts := time.Now().UTC().Format("2006-01-02T150405Z")
	filename := fmt.Sprintf("calendar-%s.db", ts)
	dest := filepath.Join(backupDir, filename)

	src, err := os.Open(db.Path)
	if err != nil {
		log.Printf("backup open source: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Backup failed"))
		return
	}
	defer src.Close()

	dst, err := os.Create(dest)
	if err != nil {
		log.Printf("backup create dest: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Backup failed"))
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		log.Printf("backup copy: %v", err)
		os.Remove(dest)
		middleware.JSONResponse(w, 500, apperror.Internal("Backup failed"))
		return
	}

	middleware.JSONResponse(w, 201, map[string]string{"filename": filename})
}

func handleList(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(backupDir)
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

	// Path traversal protection
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") ||
		strings.Contains(filename, "..") || !strings.HasSuffix(filename, ".db") {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid filename"))
		return
	}

	path := filepath.Join(backupDir, filename)
	if _, err := os.Stat(path); err != nil {
		middleware.JSONResponse(w, 404, apperror.NotFound("Backup not found"))
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, path)
}

func handleRestore(w http.ResponseWriter, r *http.Request) {
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

	src := filepath.Join(backupDir, req.Filename)
	if _, err := os.Stat(src); err != nil {
		middleware.JSONResponse(w, 404, apperror.NotFound("Backup not found"))
		return
	}

	// Copy backup over current database file.
	// SQLite in WAL mode handles file replacement safely:
	// existing connection keeps working; new connections read the new file.
	srcFile, err := os.Open(src)
	if err != nil {
		log.Printf("restore open backup: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}
	defer srcFile.Close()

	dstFile, err := os.Create(db.Path)
	if err != nil {
		log.Printf("restore create db: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		log.Printf("restore copy: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Restore failed"))
		return
	}

	middleware.JSONResponse(w, 200, map[string]string{
		"message": "Restored. The server will use the new data after restart.",
	})
}
