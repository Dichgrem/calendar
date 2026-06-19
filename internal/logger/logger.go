package logger

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ringBuf stores the last N log entries.
type ringBuf struct {
	mu    sync.Mutex
	lines []string
	cap   int
	pos   int
	full  bool
}

func (rb *ringBuf) Append(line string) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	if len(rb.lines) < rb.cap {
		rb.lines = append(rb.lines, line)
		return
	}
	rb.lines[rb.pos] = line
	rb.pos = (rb.pos + 1) % rb.cap
	rb.full = true
}

func (rb *ringBuf) All() []string {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	if !rb.full {
		out := make([]string, len(rb.lines))
		copy(out, rb.lines)
		return out
	}
	out := make([]string, rb.cap)
	n := copy(out, rb.lines[rb.pos:])
	copy(out[n:], rb.lines[:rb.pos])
	return out
}

var ring = &ringBuf{cap: 2000}

type ringWriter struct{ rb *ringBuf }

func (rw *ringWriter) Write(p []byte) (int, error) {
	s := string(p)
	if len(s) > 0 && s[len(s)-1] == '\n' {
		s = s[:len(s)-1]
	}
	rw.rb.Append(s)
	return len(p), nil
}

const maxLogFileSize = 10 << 20 // 10 MB per day

// rotatingFile wraps an *os.File and rotates to .1 suffix when maxLogFileSize is exceeded.
type rotatingFile struct {
	mu   sync.Mutex
	f    *os.File
	path string
	size int64
}

func (rf *rotatingFile) Write(p []byte) (int, error) {
	rf.mu.Lock()
	defer rf.mu.Unlock()

	if rf.size > 0 && rf.size+int64(len(p)) > maxLogFileSize {
		_ = rf.f.Close()
		_ = os.Rename(rf.path, rf.path+".1")
		f, err := os.OpenFile(rf.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return 0, err
		}
		rf.f = f
		rf.size = 0
	}

	n, err := rf.f.Write(p)
	rf.size += int64(n)
	return n, err
}

func init() {
	writers := []io.Writer{os.Stderr, &ringWriter{rb: ring}}

	logDir := os.Getenv("LOG_DIR")
	if logDir == "-" {
		logDir = ""
	}
	if logDir == "" {
		// Default: alongside the database directory
		if dbPath := os.Getenv("DATABASE_URL"); dbPath != "" {
			logDir = filepath.Join(filepath.Dir(dbPath), "logs")
		} else {
			logDir = "data/logs"
		}
	}

	if logDir != "" {
		if err := os.MkdirAll(logDir, 0o755); err == nil {
			today := time.Now().UTC().Format("2006-01-02")
			filename := filepath.Join(logDir, "server-"+today+".log")
			f, err := os.OpenFile(filename, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
			if err == nil {
				writers = append(writers, &rotatingFile{f: f, path: filename})
			}
		}
		// Clean up old log files (>7 days)
		go cleanupOldLogs(logDir)
	}

	w := io.MultiWriter(writers...)
	h := slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug})
	slog.SetDefault(slog.New(h))
}

func cleanupOldLogs(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "server-") || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
}

// Info logs at info level. Supports printf-style formatting.
func Info(msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	slog.Default().Info(msg)
}

// Error logs at error level. Supports printf-style formatting.
func Error(msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	slog.Default().Error(msg)
}

// Debug logs at debug level. Supports printf-style formatting.
func Debug(msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	slog.Default().Debug(msg)
}

// Fatal logs at error level then exits. Supports printf-style formatting.
func Fatal(msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	slog.Default().Error(msg)
	os.Exit(1)
}

// HandleLogs returns recent log entries as JSON.
func HandleLogs(w http.ResponseWriter, r *http.Request) {
	level := r.URL.Query().Get("level")
	n, err := strconv.Atoi(r.URL.Query().Get("n"))
	Debug("[api] GET /api/logs level=%s n=%d", level, n)
	if err != nil || n <= 0 || n > 2000 {
		n = 500
	}

	all := ring.All()
	var filtered []string
	minLevel := parseLevel(level)

	for i := len(all) - 1; i >= 0 && len(filtered) < n; i-- {
		line := all[i]
		if level != "" && detectLineLevel(line) < minLevel {
			continue
		}
		filtered = append(filtered, line)
	}
	for i, j := 0, len(filtered)-1; i < j; i, j = i+1, j-1 {
		filtered[i], filtered[j] = filtered[j], filtered[i]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true, "data": map[string]any{"lines": filtered, "total": len(all)},
	})
}

// parseLevel maps a query-param level name to slog.Level.
func parseLevel(name string) slog.Level {
	switch name {
	case "error":
		return slog.LevelError
	case "warn":
		return slog.LevelWarn
	case "info":
		return slog.LevelInfo
	case "debug":
		return slog.LevelDebug
	default:
		return slog.LevelInfo
	}
}

// detectLineLevel extracts the slog.Level from a log line.
func detectLineLevel(line string) slog.Level {
	for i := 0; i < len(line)-6; i++ {
		if line[i:i+6] == "level=" {
			rest := line[i+6:]
			for j, c := range rest {
				if c == ' ' {
					switch rest[:j] {
					case "ERROR":
						return slog.LevelError
					case "WARN":
						return slog.LevelWarn
					case "INFO":
						return slog.LevelInfo
					case "DEBUG":
						return slog.LevelDebug
					}
					break
				}
			}
		}
	}
	return slog.LevelInfo
}
