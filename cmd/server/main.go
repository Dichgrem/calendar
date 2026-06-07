package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
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
	"calendar/internal/config"
	"calendar/internal/db"
	cal "calendar/internal/calendar"
	ev "calendar/internal/event"
	"calendar/internal/ics"
	"calendar/internal/middleware"
	"calendar/internal/settings"
)

//go:embed dist
var distFS embed.FS

//go:embed migrations/*.sql
var migrationsFS embed.FS

func main() {
	cfg := config.Load()

	// Open database
	if err := db.Open(cfg.DatabaseURL); err != nil {
		log.Fatalf("Database open failed: %v", err)
	}
	defer db.Close()

	// Run embedded migrations
	if err := runMigrations(); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	// Build router
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(middleware.ErrorHandler)
	r.Use(middleware.SecurityHeaders)

	// Public routes (no auth)
	r.Group(func(r chi.Router) {
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

	// Protected routes (auth required)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)

		// Auth-protected endpoints
		auth.RegisterProtectedRoutes(r)

		// Core resources
		cal.RegisterRoutes(r)
		ev.RegisterRoutes(r)
		settings.RegisterRoutes(r)
		ics.RegisterRoutes(r)
	})

	// Static file serving with SPA fallback (catch-all, matched last)
	staticFS, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatalf("Static files not embedded: %v — did you run pnpm build?", err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if f, err := staticFS.Open(path); err == nil {
			f.Close()
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
		log.Printf("Received signal %v, shutting down gracefully...", sig)

		// Give in-flight requests up to 10 seconds to complete
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("Shutdown error: %v", err)
		}
	}()

	log.Printf("Server starting on http://localhost%s", addr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
	log.Println("Server stopped")
}

func runMigrations() error {
	data, err := migrationsFS.ReadFile("migrations/00001_initial.sql")
	if err != nil {
		return fmt.Errorf("read migration: %w", err)
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
			return fmt.Errorf("migration exec: %w\nSQL: %s", err, stmt)
		}
	}
	log.Println("Migrations complete")
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
