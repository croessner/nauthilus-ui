package models

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUserJSONOmitsSensitiveFields(t *testing.T) {
	user := User{
		Username:     "alice",
		PasswordHash: "hashed",
		Roles:        []string{"user"},
		TOTPEnabled:  true,
		TOTPSecret:   "top-secret",
	}

	raw, err := json.Marshal(user)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	payload := string(raw)
	if strings.Contains(payload, "passwordHash") {
		t.Fatalf("expected passwordHash to be omitted from JSON, got %s", payload)
	}
	if strings.Contains(payload, "totpSecret") {
		t.Fatalf("expected totpSecret to be omitted from JSON, got %s", payload)
	}
}

func TestToUserViewStripsSecrets(t *testing.T) {
	user := User{
		Username:        "alice",
		PasswordHash:    "hashed",
		Roles:           []string{"user"},
		TOTPEnabled:     true,
		TOTPSecret:      "top-secret",
		WebAuthnEnabled: true,
	}

	view := ToUserView(user)
	if view.Username != "alice" {
		t.Fatalf("expected username alice, got %q", view.Username)
	}
	if !view.TOTPEnabled {
		t.Fatal("expected TOTPEnabled to be preserved")
	}

	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	payload := string(raw)
	if strings.Contains(payload, "totpSecret") {
		t.Fatalf("expected totpSecret to be omitted from public view, got %s", payload)
	}
	if strings.Contains(payload, "passwordHash") {
		t.Fatalf("expected passwordHash to be omitted from public view, got %s", payload)
	}
}

func TestJWTConfigJSONOmitsSecret(t *testing.T) {
	cfg := JWTConfig{
		JWTSecret:          "jwt-secret",
		TokenExpiry:        3600,
		RefreshTokenExpiry: 7200,
		RememberMeExpiry:   86400,
	}

	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	payload := string(raw)
	if strings.Contains(payload, "jwtSecret") {
		t.Fatalf("expected jwtSecret to be omitted from JSON, got %s", payload)
	}

	view := ToJWTConfigView(cfg)
	if !view.JWTSecretConfigured {
		t.Fatal("expected JWTSecretConfigured to be true")
	}
}
