package caldav

import (
	"net/http"
	"strings"
	"time"

	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
)

func handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	calID, filename := parseCalPath(r.URL.Path)
	eventID := strings.TrimSuffix(filename, ".ics")
	userID := userIDFromReq(r)
	perm := middleware.GetPermission(r)
	logger.Info("[caldav] DELETE %s cal=%s uid=%s user=%s", r.URL.Path, calID, eventID, userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if !perm.RequireRole(calID, "editor") {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	res, _ := db.DB.Exec(`UPDATE events SET deleted=1, updated_at=?, last_modified=? WHERE id=? AND calendar_id=?`,
		time.Now().UTC().Format(time.RFC3339), time.Now().UnixMilli(), eventID, calID)
	affected, _ := res.RowsAffected()
	if affected == 0 {
		logger.Info("[caldav] DELETE %s: not found", r.URL.Path)
		http.Error(w, "Not Found", 404)
		return
	}
	w.WriteHeader(204)
}
