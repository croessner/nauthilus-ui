package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"nauthilus-ui/server/config"
	"nauthilus-ui/server/db"
)

func TestProxyOIDCTokenRequiresAuthentication(t *testing.T) {
	router := setupProxyRouter(&config.Config{}, &db.MongoDB{})

	req := httptest.NewRequest(http.MethodGet, "/proxy/oidc-token?url=https://example.invalid", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for unauthenticated proxy access, got %d", recorder.Code)
	}
}

func TestProxyRejectsLegacyBackendAuthQueryParams(t *testing.T) {
	router := setupProxyRouter(&config.Config{}, &db.MongoDB{})

	req := httptest.NewRequest(http.MethodGet, "/proxy/ping?url=https://example.invalid&authType=bearer&authValue=secret-token", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for legacy backend auth query params, got %d", recorder.Code)
	}
}

func TestProxyOIDCTokenOptionsRemainsPublicPreflight(t *testing.T) {
	router := setupProxyRouter(&config.Config{}, &db.MongoDB{})

	req := httptest.NewRequest(http.MethodOptions, "/proxy/oidc-token", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 for proxy preflight, got %d", recorder.Code)
	}
}

func TestProxyPreflightRejectsDisallowedOrigin(t *testing.T) {
	router := setupProxyRouter(&config.Config{
		CORSAllowedOrigins: []string{"https://ui.example.com"},
	}, &db.MongoDB{})

	req := httptest.NewRequest(http.MethodOptions, "/proxy/oidc-token", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for disallowed proxy preflight origin, got %d", recorder.Code)
	}
}

func TestProxyMutationRejectsMissingCSRFFromCookieSession(t *testing.T) {
	router := setupProxyRouter(&config.Config{}, &db.MongoDB{})

	req := httptest.NewRequest(http.MethodPost, "/proxy/ping?url=https://example.invalid", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.AddCookie(&http.Cookie{Name: "nauthilus_ui_session", Value: "cookie-session"})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for missing CSRF token on proxy mutation, got %d", recorder.Code)
	}
}
