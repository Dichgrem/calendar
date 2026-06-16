package sync

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
)

// RegisterRoutes adds sync routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Get("/api/sync/pull", handlePull)
	r.Post("/api/sync/push", handlePush)
}

// SyncChangeRecord represents one row from sync_sequence.
type SyncChangeRecord struct {
	Seq       int    `json:"-"`
	TableName string `json:"-"`
	RecordID  string `json:"-"`
	Op        string `json:"-"`
	SyncedAt  string `json:"-"`
}

// SyncPullResponse matches the shape expected by WatermelonDB/web client.
type SyncPullResponse struct {
	Changes map[string]TableChanges `json:"changes"`
	Seq     int                     `json:"seq"`
}

type TableChanges struct {
	Created []map[string]interface{} `json:"created"`
	Updated []map[string]interface{} `json:"updated"`
	Deleted []string                 `json:"deleted"`
}

func handlePull(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[sync] GET pull")
	lastSeq := 0
	if s := r.URL.Query().Get("last_pulled_seq"); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			lastSeq = n
		}
	}

	// Collect changed records from sync_sequence
	rows, err := db.DB.Query(
		`SELECT id, table_name, record_id, op, synced_at FROM sync_sequence WHERE id > ? ORDER BY id ASC`,
		lastSeq,
	)
	changes := SyncPullResponse{
		Changes: map[string]TableChanges{},
		Seq:     lastSeq,
	}
	if err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var r SyncChangeRecord
			if rows.Scan(&r.Seq, &r.TableName, &r.RecordID, &r.Op, &r.SyncedAt) != nil {
				continue
			}
			changes.Seq = r.Seq
			tc := changes.Changes[r.TableName]
			switch r.Op {
			case "created", "updated":
				row := fetchRecord(r.TableName, r.RecordID)
				if row != nil {
					if r.Op == "created" {
						tc.Created = append(tc.Created, row)
					} else {
						tc.Updated = append(tc.Updated, row)
					}
				}
			case "deleted":
				tc.Deleted = append(tc.Deleted, r.RecordID)
			}
			changes.Changes[r.TableName] = tc
		}
	}

	// Also collect deleted_log entries after lastSeq
	deletedRows, err := db.DB.Query(
		`SELECT table_name, record_id FROM deleted_log`,
	)
	if err == nil {
		defer func() { _ = deletedRows.Close() }()
		for deletedRows.Next() {
			var tableName, recordID string
			if deletedRows.Scan(&tableName, &recordID) != nil {
				continue
			}
			tc := changes.Changes[tableName]
			tc.Deleted = append(tc.Deleted, recordID)
			changes.Changes[tableName] = tc
		}
	}

	middleware.JSONResponse(w, 200, changes)
}

type pushBody struct {
	Changes       map[string]TableChanges `json:"changes"`
	LastPulledSeq int                     `json:"last_pulled_seq"`
}

func handlePush(w http.ResponseWriter, r *http.Request) {
	logger.Debug("[sync] POST push")
	var req pushBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	// In a full implementation, this would apply LWW conflict resolution,
	// write to sync_sequence, and detect conflicts.
	// Phase 1: acknowledge the push, return current max seq.

	var maxSeq int
	_ = db.DB.QueryRow("SELECT COALESCE(MAX(id), 0) FROM sync_sequence").Scan(&maxSeq)

	middleware.JSONResponse(w, 200, map[string]int{"seq": maxSeq})
}

// fetchRecord loads a full record from the given table by ID.
// Returns a map with camelCase keys matching the client schema.
func fetchRecord(table string, id string) map[string]interface{} {
	switch table {
	case "calendars":
		var r struct {
			ID, Name, Color, SourceType, OwnerID, CreatedAt, UpdatedAt string
			SourceURL                                                  *string
			LastModified                                               int64
		}
		err := db.DB.QueryRow(
			`SELECT id, name, color, source_url, source_type, owner_id, created_at, updated_at, last_modified FROM calendars WHERE id=?`, id,
		).Scan(&r.ID, &r.Name, &r.Color, &r.SourceURL, &r.SourceType, &r.OwnerID, &r.CreatedAt, &r.UpdatedAt, &r.LastModified)
		if err != nil {
			return nil
		}
		return map[string]interface{}{
			"id": r.ID, "name": r.Name, "color": r.Color,
			"sourceUrl": r.SourceURL, "sourceType": r.SourceType,
			"ownerId": r.OwnerID, "createdAt": r.CreatedAt,
			"updatedAt": r.UpdatedAt, "lastModified": r.LastModified,
		}
	case "events":
		var r struct {
			ID, CalendarID, Title, StartAt, EndAt, CreatedAt, UpdatedAt string
			Description, RRule, Color, Location, ParentID, OriginalDate *string
			AllDay, Deleted                                             int
			LastModified                                                int64
		}
		err := db.DB.QueryRow(
			`SELECT id, calendar_id, title, description, start_at, end_at, all_day, rrule,
			        color, location, parent_id, original_date, deleted, created_at, updated_at, last_modified
			 FROM events WHERE id=?`, id,
		).Scan(&r.ID, &r.CalendarID, &r.Title, &r.Description, &r.StartAt, &r.EndAt,
			&r.AllDay, &r.RRule, &r.Color, &r.Location, &r.ParentID, &r.OriginalDate,
			&r.Deleted, &r.CreatedAt, &r.UpdatedAt, &r.LastModified)
		if err != nil {
			return nil
		}
		return map[string]interface{}{
			"id": r.ID, "calendarId": r.CalendarID, "title": r.Title,
			"description": r.Description, "startAt": r.StartAt, "endAt": r.EndAt,
			"allDay": r.AllDay != 0, "rrule": r.RRule, "color": r.Color,
			"location": r.Location, "parentId": r.ParentID, "originalDate": r.OriginalDate,
			"deleted": r.Deleted != 0, "createdAt": r.CreatedAt,
			"updatedAt": r.UpdatedAt, "lastModified": r.LastModified,
		}
	case "event_overrides":
		var r struct {
			ID, ParentID, OriginalDate                string
			OverrideStart, OverrideEnd, OverrideTitle *string
			Deleted                                   int
			LastModified                              int64
		}
		err := db.DB.QueryRow(
			`SELECT id, parent_id, original_date, override_start, override_end, override_title, deleted, last_modified FROM event_overrides WHERE id=?`, id,
		).Scan(&r.ID, &r.ParentID, &r.OriginalDate, &r.OverrideStart, &r.OverrideEnd, &r.OverrideTitle, &r.Deleted, &r.LastModified)
		if err != nil {
			return nil
		}
		return map[string]interface{}{
			"id": r.ID, "parentId": r.ParentID, "originalDate": r.OriginalDate,
			"overrideStart": r.OverrideStart, "overrideEnd": r.OverrideEnd,
			"overrideTitle": r.OverrideTitle, "deleted": r.Deleted != 0,
			"lastModified": r.LastModified,
		}
	}
	return nil
}
