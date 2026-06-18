package logger

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestRingBufAppendAll(t *testing.T) {
	rb := &ringBuf{cap: 3}
	rb.Append("a")
	rb.Append("b")
	all := rb.All()
	if len(all) != 2 || all[0] != "a" || all[1] != "b" {
		t.Fatalf("got %v", all)
	}
	rb.Append("c") // fill
	rb.Append("d") // wraps, overwrites "a"
	all = rb.All()
	if len(all) != 3 || all[0] != "b" || all[1] != "c" || all[2] != "d" {
		t.Fatalf("expected [b c d] got %v", all)
	}
}

func TestRingBufConcurrent(t *testing.T) {
	rb := &ringBuf{cap: 100}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				rb.Append("x")
			}
		}(i)
	}
	wg.Wait()
	all := rb.All()
	if len(all) > 100 {
		t.Fatalf("overflow: %d", len(all))
	}
}

func TestRingWriter(t *testing.T) {
	rb := &ringBuf{cap: 5}
	rw := &ringWriter{rb: rb}
	_, _ = rw.Write([]byte("hello\n"))
	_, _ = rw.Write([]byte("world\n"))
	all := rb.All()
	if len(all) != 2 || all[0] != "hello" || all[1] != "world" {
		t.Fatalf("got %v", all)
	}
	// Test trailing newline removal
	_, _ = rw.Write([]byte("no-newline"))
	if rb.All()[2] != "no-newline" {
		t.Fatalf("got %q", rb.All()[2])
	}
}

func TestParseLevel(t *testing.T) {
	cases := []struct {
		in  string
		out string
	}{
		{"error", "ERROR"},
		{"warn", "WARN"},
		{"info", "INFO"},
		{"debug", "DEBUG"},
		{"", "INFO"},
		{"unknown", "INFO"},
	}
	for _, c := range cases {
		lvl := parseLevel(c.in)
		if lvl.String() != c.out {
			t.Errorf("parseLevel(%q)=%s want %s", c.in, lvl, c.out)
		}
	}
}

func TestDetectLineLevel(t *testing.T) {
	cases := []struct {
		line string
		want string
	}{
		{`time=2026-01-01 level=ERROR msg="fail"`, "ERROR"},
		{`time=2026-01-01 level=WARN msg="hmm"`, "WARN"},
		{`time=2026-01-01 level=INFO msg="ok"`, "INFO"},
		{`time=2026-01-01 level=DEBUG msg="trace"`, "DEBUG"},
		{`plain text without level`, "INFO"}, // default
	}
	for _, c := range cases {
		got := detectLineLevel(c.line)
		if got.String() != c.want {
			t.Errorf("detectLineLevel(%q)=%s want %s", c.line, got, c.want)
		}
	}
}

func TestHandleLogsLevelFilter(t *testing.T) {
	// Clear the ring buffer by reading all entries until empty.
	// We can't swap the ring pointer because init() already captured it in ringWriter.
	clearRing := func() {
		ring.mu.Lock()
		ring.lines = ring.lines[:0]
		ring.pos = 0
		ring.full = false
		ring.mu.Unlock()
	}

	clearRing()
	Info("info-one")
	Error("error-one")
	Info("info-two")
	Debug("debug-one")

	doReq := func(level string, n int) []string {
		url := "/api/logs?n=" + itoa(n)
		if level != "" {
			url += "&level=" + level
		}
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		HandleLogs(w, req)
		var resp struct {
			Data struct {
				Lines []string `json:"lines"`
			} `json:"data"`
		}
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return resp.Data.Lines
	}

	// all
	all := doReq("", 100)
	if len(all) < 4 {
		t.Fatalf("expected >=4 lines got %d", len(all))
	}

	// error only
	errs := doReq("error", 100)
	for _, l := range errs {
		if !strings.Contains(l, "level=ERROR") {
			t.Errorf("error filter returned non-ERROR: %s", l)
		}
	}
	if len(errs) == 0 {
		t.Error("error filter returned 0 lines")
	}

	// info only
	infos := doReq("info", 100)
	for _, l := range infos {
		if strings.Contains(l, "level=DEBUG") {
			t.Errorf("info filter returned DEBUG: %s", l)
		}
	}

	// debug → includes INFO too (debug >= debug includes INFO and ERROR)
	debs := doReq("debug", 100)
	hasDebug := false
	for _, l := range debs {
		if strings.Contains(l, "level=DEBUG") {
			hasDebug = true
		}
	}
	if !hasDebug {
		t.Error("debug filter failed to return DEBUG lines")
	}

	// n limit
	few := doReq("", 2)
	if len(few) > 2 {
		t.Errorf("n=2 returned %d lines", len(few))
	}
}

func TestHandleLogsUnauthorized(t *testing.T) {
	// HandleLogs doesn't check auth — caller (main.go) wraps it behind RequireAuth.
	// So HandleLogs should always return 200.
	req := httptest.NewRequest("GET", "/api/logs", nil)
	w := httptest.NewRecorder()
	HandleLogs(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200 got %d", w.Code)
	}
}

func TestInfoErrorDebugFatal(t *testing.T) {
	// Reset ring to known state
	ring.mu.Lock()
	ring.lines = ring.lines[:0]
	ring.pos = 0
	ring.full = false
	ring.mu.Unlock()

	Info("test info %s", "arg")
	Error("test error %d", 42)
	Debug("test debug no-args")

	all := ring.All()
	found := 0
	for _, l := range all {
		switch {
		case strings.Contains(l, "test info arg"):
			found++
		case strings.Contains(l, "test error 42"):
			found++
		case strings.Contains(l, "test debug no-args"):
			found++
		}
	}
	if found < 3 {
		t.Errorf("expected 3 log entries, found %d", found)
	}
}

func itoa(n int) string { return strings.TrimSpace(fmt.Sprintf("%d", n)) }

func TestRotatingFileWrite(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "test.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	rf := &rotatingFile{f: f, path: path}

	// Write a small line
	_, _ = rf.Write([]byte("hello\n"))
	if rf.size != 6 {
		t.Errorf("size=%d want 6", rf.size)
	}

	// Verify file contents
	got, _ := os.ReadFile(path)
	if string(got) != "hello\n" {
		t.Errorf("got %q", got)
	}
}

func TestRotatingFileRotation(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "test.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	rf := &rotatingFile{f: f, path: path}

	// Write data up to near the limit, then cross it
	data := make([]byte, maxLogFileSize-5)
	for i := range data {
		data[i] = 'a'
	}
	_, _ = rf.Write(data)                 // size = maxLogFileSize - 5
	_, _ = rf.Write([]byte("ZZZZZZZZZZ")) // triggers rotation (5 + 10 = maxLogFileSize+5)

	// The original file should now be closed and renamed to .1
	rotated := path + ".1"
	if _, err := os.Stat(rotated); err != nil {
		t.Errorf("rotated file missing: %v", err)
	}

	// The new file should contain only the overflow write
	got, _ := os.ReadFile(path)
	if string(got) != "ZZZZZZZZZZ" {
		t.Errorf("new file got %q want 'ZZZZZZZZZZ'", got)
	}
}
