-- Fix zero-duration events: add 1 hour to end_at when start_at == end_at
UPDATE events SET end_at = strftime('%Y-%m-%dT%H:%M:%SZ', datetime(start_at, '+1 hour')) WHERE start_at = end_at AND all_day = 0 AND deleted = 0;

-- Fix .000Z millisecond suffix
UPDATE events SET start_at = replace(start_at, '.000Z', 'Z'), end_at = replace(end_at, '.000Z', 'Z') WHERE start_at LIKE '%.%Z';
