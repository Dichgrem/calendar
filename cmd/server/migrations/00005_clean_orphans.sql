-- Clean orphan calendar_members (calendar deleted but members remain)
DELETE FROM calendar_members WHERE calendar_id NOT IN (SELECT id FROM calendars);

-- Clean orphan events (calendar deleted but events remain)
DELETE FROM events WHERE calendar_id NOT IN (SELECT id FROM calendars);
