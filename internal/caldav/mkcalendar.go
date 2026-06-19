package caldav

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"

	"calendar/internal/db"
	"calendar/internal/logger"
)

func handleMkcalendar(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromReq(r)
	logger.Info("[caldav] MKCALENDAR user=%s", userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	name := "New Calendar"
	color := "#3b82f6"
	body, _ := io.ReadAll(r.Body)
	type mkcalS struct {
		Set struct {
			Prop struct {
				DisplayName string `xml:"displayname"`
				Color       string `xml:"calendar-color"`
			} `xml:"prop"`
		} `xml:"set"`
	}
	var req mkcalS
	if xml.Unmarshal(body, &req) == nil {
		if req.Set.Prop.DisplayName != "" {
			name = req.Set.Prop.DisplayName
		}
		if req.Set.Prop.Color != "" {
			color = req.Set.Prop.Color
		}
	}

	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()
	tx, err := db.DB.Begin()
	if err != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`INSERT INTO calendars (id, name, color, source_type, owner_id, created_at, updated_at, last_modified) VALUES (?,?,?,?,?,?,?,?)`, id, name, color, "manual", userID, now, now, lmod); err != nil {
		logger.Error("[caldav] MKCALENDAR insert calendar error: %v", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	if _, err := tx.Exec(`INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?,?,?)`, id, userID, "admin"); err != nil {
		logger.Error("[caldav] MKCALENDAR insert member error: %v", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	if tx.Commit() != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}

	host := r.Host
	scheme := requestScheme(r)
	w.Header().Set("Location", fmt.Sprintf("%s://%s/dav/calendars/%s/", scheme, host, id))
	logger.Info("[caldav] MKCALENDAR created id=%s name=%q", id, name)
	w.WriteHeader(201)
}
