package util

import (
	"time"

	ical "github.com/emersion/go-ical"
)

func BoolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func StrOrNil(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// ComponentProp reads a property from a component, falling back to raw Value
// when the property name is not recognized by go-ical.
func ComponentProp(c *ical.Component, name string) string {
	s, _ := c.Props.Text(name)
	if s == "" {
		vals := c.Props.Values(name)
		if len(vals) > 0 && vals[0].Value != "" {
			s = vals[0].Value
		}
	}
	return s
}

// SetDateProp sets a date/datetime property with correct VALUE parameter.
func SetDateProp(props ical.Props, name, value string) {
	if value == "" {
		return
	}
	switch len(value) {
	case 8:
		// ICS raw date: YYYYMMDD
		t, err := time.Parse("20060102", value)
		if err != nil {
			props.SetText(name, value)
			return
		}
		props.SetDate(name, t)
		return
	case 15, 16:
		// ICS raw datetime: YYYYMMDDTHHMMSS[Z]
		s := value[0:4] + "-" + value[4:6] + "-" + value[6:8] + "T" +
			value[9:11] + ":" + value[11:13] + ":" + value[13:15]
		if len(value) == 16 && value[15] == 'Z' {
			s += "Z"
		}
		setDatePropFromISO(props, name, s, value)
		return
	}
	// ISO format or other
	setDatePropFromISO(props, name, value, value)
}

func setDatePropFromISO(props ical.Props, name, s, raw string) {
	// ISO date: YYYY-MM-DD
	if len(s) == 10 && s[4] == '-' && s[7] == '-' {
		t, _ := time.Parse("2006-01-02", s)
		if t.IsZero() {
			props.SetText(name, raw)
			return
		}
		props.SetDate(name, t)
		return
	}
	// Try RFC3339 first (handles Z suffix correctly)
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		// Try format without Z
		t, err = time.Parse("2006-01-02T15:04:05Z", s)
	}
	if err != nil {
		t, _ = time.Parse("2006-01-02T15:04:05", s)
	}
	if t.IsZero() {
		props.SetText(name, raw)
		return
	}
	props.SetDateTime(name, t)
}
