package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port              int
	DatabaseURL       string
	SessionDuration   time.Duration
	SecureCookies     bool
	UserDefaults      UserDefaults
}

type UserDefaults struct {
	Language          string
	FirstDayOfWeek    int
	ShowEventTime     bool
	DateFormat        string
	ShowLunarCalendar bool
}

func Load() *Config {
	return &Config{
		Port:            envInt("PORT", 3000),
		DatabaseURL:     envStr("DATABASE_URL", "./data/calendar.db"),
		SessionDuration: 30 * 24 * time.Hour,
		SecureCookies:   envBool("SECURE_COOKIES", false),
		UserDefaults: UserDefaults{
			Language:          envStr("USER_DEFAULT_LANGUAGE", "zh-CN"),
			FirstDayOfWeek:    envInt("USER_DEFAULT_FIRST_DAY_OF_WEEK", 1),
			ShowEventTime:     envBool("USER_DEFAULT_SHOW_EVENT_TIME", false),
			DateFormat:        envStr("USER_DEFAULT_DATE_FORMAT", "zh"),
			ShowLunarCalendar: envBool("USER_DEFAULT_SHOW_LUNAR_CALENDAR", true),
		},
	}
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		switch v {
		case "1", "true", "yes":
			return true
		case "0", "false", "no":
			return false
		}
	}
	return fallback
}
