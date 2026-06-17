package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	cfg := Load()
	if cfg.Port != 3000 {
		t.Errorf("default port: %d", cfg.Port)
	}
	if cfg.DatabaseURL != "./data/calendar.db" {
		t.Errorf("default db url: %s", cfg.DatabaseURL)
	}
	if cfg.SecureCookies {
		t.Errorf("default secure cookies should be false")
	}
	if cfg.UserDefaults.Language != "zh-CN" {
		t.Errorf("default language: %s", cfg.UserDefaults.Language)
	}
	if cfg.UserDefaults.FirstDayOfWeek != 1 {
		t.Errorf("default first day: %d", cfg.UserDefaults.FirstDayOfWeek)
	}
}

func TestLoadFromEnv(t *testing.T) {
	_ = os.Setenv("PORT", "9999")
	_ = os.Setenv("DATABASE_URL", "/tmp/test.db")
	_ = os.Setenv("SECURE_COOKIES", "true")
	defer func() {
		_ = os.Unsetenv("PORT")
		_ = os.Unsetenv("DATABASE_URL")
		_ = os.Unsetenv("SECURE_COOKIES")
	}()

	cfg := Load()
	if cfg.Port != 9999 {
		t.Errorf("env port: %d", cfg.Port)
	}
	if cfg.DatabaseURL != "/tmp/test.db" {
		t.Errorf("env db: %s", cfg.DatabaseURL)
	}
	if !cfg.SecureCookies {
		t.Errorf("env secure cookies should be true")
	}
}

func TestEnvBoolValues(t *testing.T) {
	_ = os.Setenv("TEST_BOOL", "1")
	if b := envBool("TEST_BOOL", false); !b {
		t.Error("'1' should be true")
	}
	_ = os.Unsetenv("TEST_BOOL")

	_ = os.Setenv("TEST_BOOL", "false")
	if b := envBool("TEST_BOOL", true); b {
		t.Error("'false' should be false")
	}
	_ = os.Unsetenv("TEST_BOOL")

	_ = os.Setenv("TEST_BOOL", "yes")
	if b := envBool("TEST_BOOL", false); !b {
		t.Error("'yes' should be true")
	}
	_ = os.Unsetenv("TEST_BOOL")

	_ = os.Setenv("TEST_BOOL", "garbage")
	if b := envBool("TEST_BOOL", true); !b {
		t.Error("garbage should fallback to true")
	}
	_ = os.Unsetenv("TEST_BOOL")
}

func TestEnvIntFallback(t *testing.T) {
	if n := envInt("NONEXISTENT_KEY_XYZ", 42); n != 42 {
		t.Errorf("fallback: got %d want 42", n)
	}
	_ = os.Setenv("TEST_INT", "abc")
	if n := envInt("TEST_INT", 99); n != 99 {
		t.Errorf("invalid should fallback: got %d", n)
	}
	_ = os.Unsetenv("TEST_INT")
}
