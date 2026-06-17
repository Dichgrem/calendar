package validate

import "testing"

func TestHexColorValid(t *testing.T) {
	valid := []string{"#3b82f6", "#000000", "#ffffff", "#FFFFFF", "#a1b2c3", "#0f0f0f"}
	for _, c := range valid {
		if !HexColor(c) {
			t.Errorf("expected valid: %s", c)
		}
	}
}

func TestHexColorInvalid(t *testing.T) {
	invalid := []string{"", "#", "red", "#123", "#12345", "#1234567", "#GGGGGG", "3b82f6", "#abc", "#ABC", " #3b82f6"}
	for _, c := range invalid {
		if HexColor(c) {
			t.Errorf("expected invalid: %s", c)
		}
	}
}
