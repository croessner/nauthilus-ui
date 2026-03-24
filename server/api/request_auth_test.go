package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestReadAccessTokenFromRequestIgnoresAuthorizationHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer opaque-token")

	if token := readAccessTokenFromRequest(req); token != "" {
		t.Fatalf("expected Authorization header to be ignored, got %q", token)
	}
}

func TestReadAccessTokenFromRequestUsesSessionCookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: accessCookieName, Value: "cookie-session"})
	req.Header.Set("Authorization", "Bearer opaque-token")

	if token := readAccessTokenFromRequest(req); token != "cookie-session" {
		t.Fatalf("expected session cookie token, got %q", token)
	}
}
