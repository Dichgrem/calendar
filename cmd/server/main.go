package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	_ "modernc.org/sqlite"

	"calendar/internal/auth"
	"calendar/internal/backup"
	"calendar/internal/caldav"
	cal "calendar/internal/calendar"
	"calendar/internal/config"
	"calendar/internal/db"
	ev "calendar/internal/event"
	"calendar/internal/ics"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/settings"
	"calendar/internal/sync"
)

//go:embed dist
var distFS embed.FS

//go:embed migrations/*.sql
var migrationsFS embed.FS

func main() {
	cfg := config.Load()

	// Open database
	if err := db.Open(cfg.DatabaseURL); err != nil {
		logger.Fatal("Database open failed: %v", err)
	}
	defer db.Close()

	// Run embedded migrations
	if err := runMigrations(); err != nil {
		logger.Fatal("Migration failed: %v", err)
	}

	// Start auto backup goroutine
	backup.StartAutoBackup()

	// Clean up events with empty dates (test artifacts from earlier development)
	if _, err := db.DB.Exec("DELETE FROM events WHERE deleted = 0 AND (start_at = '' OR end_at = '')"); err != nil {
		logger.Info("Cleanup events: %v", err)
	}

	// Register CalDAV HTTP methods for Chi
	chi.RegisterMethod("PROPFIND")
	chi.RegisterMethod("REPORT")
	chi.RegisterMethod("MKCALENDAR")

	// Build router
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(middleware.ErrorHandler)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.CORS)

	// Public routes (no auth, rate-limited)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimitByAction)
		auth.RegisterRoutes(r)
	})

	// Health
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		middleware.JSONResponse(w, 200, map[string]string{"status": "ok"})
	})

	// Settings config (public, no auth)
	r.Get("/api/settings/config", func(w http.ResponseWriter, r *http.Request) {
		middleware.JSONResponse(w, 200, map[string]interface{}{
			"userDefaults": cfg.UserDefaults,
		})
	})

	notFound := func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}

	// Protected REST routes (auth required)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimitByAction)
		r.Use(middleware.RequireAuth)

		// Auth-protected endpoints
		auth.RegisterProtectedRoutes(r)

		// Logs endpoint (admin only)
		r.Get("/api/logs", func(w http.ResponseWriter, r *http.Request) {
			perm := middleware.GetPermission(r)
			var adminID string
			_ = db.DB.QueryRow("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").Scan(&adminID)
			if perm == nil || perm.UserID != adminID {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(403)
				_, _ = w.Write([]byte(`{"ok":false,"error":"admin only"}`))
				return
			}
			logger.HandleLogs(w, r)
		})

		// Core resources
		cal.RegisterRoutes(r)
		ev.RegisterRoutes(r)
		settings.RegisterRoutes(r)
		ics.RegisterRoutes(r)
		backup.RegisterRoutes(r)
		sync.RegisterRoutes(r)
	})

	// /.well-known/caldav — public, RFC 6764.
	r.Get("/.well-known/caldav", caldav.WellKnownHandler)
	r.Method("PROPFIND", "/.well-known/caldav", http.HandlerFunc(caldav.WellKnownHandler))

	// /.well-known/carddav — DAVx5 probes for both services.
	// Return 404 so it skips CardDAV cleanly.
	r.Get("/.well-known/carddav", notFound)
	r.Method("PROPFIND", "/.well-known/carddav", http.HandlerFunc(notFound))

	// CalDAV server — CaldavAuth handles Basic/Bearer + DAV challenge.
	r.Group(func(r chi.Router) {
		r.Use(middleware.CaldavAuth)
		caldav.RegisterRoutes(r)
	})

	// Root-level DAV probes — DAVx5 PROPFINDs the base URL with
	// preemptive credentials. CaldavAuth returns proper WWW-Authenticate.
	r.Group(func(r chi.Router) {
		r.Use(middleware.CaldavAuth)
		r.Method("PROPFIND", "/", http.HandlerFunc(caldav.HandlePropfindRoot))
		r.Method("OPTIONS", "/", http.HandlerFunc(caldav.HandleDavOptions))
	})

	// Static file serving with SPA fallback (catch-all, matched last)
	staticFS, err := fs.Sub(distFS, "dist")
	if err != nil {
		logger.Fatal("Static files not embedded: %v — did you run pnpm build?", err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if f, err := staticFS.Open(path); err == nil {
			_ = f.Close()
		} else {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	// Create server with explicit handle for graceful shutdown
	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown: listen for signals in a goroutine
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		logger.Info("Received signal %v, shutting down gracefully...", sig)

		// Give in-flight requests up to 10 seconds to complete
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			logger.Info("Shutdown error: %v", err)
		}
	}()

	logger.Info("Server starting on http://localhost%s", addr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		logger.Fatal("Server error: %v", err)
	}
	logger.Info("Server stopped")
}

func runMigrations() error {
	// Ensure schema_versions table exists
	if _, err := db.DB.Exec(`CREATE TABLE IF NOT EXISTS schema_versions (
		filename TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return fmt.Errorf("create schema_versions: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		var applied int
		_ = db.DB.QueryRow("SELECT COUNT(*) FROM schema_versions WHERE filename = ?", entry.Name()).Scan(&applied)
		if applied > 0 {
			continue
		}

		data, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}

		for _, stmt := range splitSQL(string(data)) {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := db.DB.Exec(stmt); err != nil {
				if strings.Contains(err.Error(), "already exists") {
					continue
				}
				return fmt.Errorf("migration %s exec: %w\nSQL: %s", entry.Name(), err, stmt)
			}
		}

		if _, err := db.DB.Exec("INSERT INTO schema_versions (filename) VALUES (?)", entry.Name()); err != nil {
			return fmt.Errorf("migration %s record: %w", entry.Name(), err)
		}
		logger.Info("Migration applied: %s", entry.Name())
	}

	logger.Info("Migrations complete")
	return nil
}

func splitSQL(script string) []string {
	raw := strings.Split(script, ";")
	var result []string
	for _, s := range raw {
		s = strings.TrimSpace(s)
		if s != "" {
			result = append(result, s)
		}
	}
	return result
}
