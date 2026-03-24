package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/requestmeta"
)

func TestFinalizeOIDCSessionSetsHttpOnlyCookiesAndRedirectsWithoutTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback", nil)

	accessExpiresAt := time.Now().Add(time.Hour)
	refreshExpiresAt := time.Now().Add(24 * time.Hour)

	finalizeOIDCSession(ctx, issuedSessionPair{
		accessToken:      "access-secret",
		accessExpiresAt:  accessExpiresAt,
		refreshToken:     "refresh-secret",
		refreshExpiresAt: refreshExpiresAt,
		rememberMe:       true,
	})

	if recorder.Code != http.StatusFound {
		t.Fatalf("expected status 302, got %d", recorder.Code)
	}

	location := recorder.Header().Get("Location")
	if location != "/" {
		t.Fatalf("expected redirect to '/', got %q", location)
	}
	if strings.Contains(location, "token=") || strings.Contains(location, "refreshToken=") || strings.Contains(location, "expiresAt=") {
		t.Fatalf("expected redirect location without token query params, got %q", location)
	}

	cookies := recorder.Result().Cookies()
	if len(cookies) < 2 {
		t.Fatalf("expected auth cookies to be set, got %d cookies", len(cookies))
	}

	var sawAccess bool
	var sawRefresh bool
	var sawCSRF bool

	for _, cookie := range cookies {
		switch cookie.Name {
		case accessCookieName:
			sawAccess = true
			if !cookie.HttpOnly {
				t.Fatal("expected access token cookie to be HttpOnly")
			}
			if cookie.Value != "access-secret" {
				t.Fatalf("expected access token cookie value to match, got %q", cookie.Value)
			}
		case refreshCookieName:
			sawRefresh = true
			if !cookie.HttpOnly {
				t.Fatal("expected refresh token cookie to be HttpOnly")
			}
			if cookie.Value != "refresh-secret" {
				t.Fatalf("expected refresh token cookie value to match, got %q", cookie.Value)
			}
		case csrfCookieName:
			sawCSRF = true
			if cookie.HttpOnly {
				t.Fatal("expected csrf cookie to be readable by JS")
			}
			if cookie.Value == "" {
				t.Fatal("expected csrf cookie value to be set")
			}
		}
	}

	if !sawAccess || !sawRefresh || !sawCSRF {
		t.Fatalf("expected access, refresh and csrf cookies, saw access=%t refresh=%t csrf=%t", sawAccess, sawRefresh, sawCSRF)
	}
}

func TestComputeOIDCCallbackURLIgnoresUntrustedForwardedHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/auth/oidc/login", nil)
	req.Host = "internal.local"
	req.RemoteAddr = "198.51.100.25:1234"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "ui.example.com")
	ctx.Request = req

	if got := computeOIDCCallbackURL(ctx); got != "http://internal.local/api/auth/oidc/callback" {
		t.Fatalf("expected callback URL to ignore untrusted forwarded headers, got %q", got)
	}
}

func TestComputeOIDCCallbackURLUsesTrustedForwardedHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	resolver, err := requestmeta.NewResolver([]string{"127.0.0.1"})
	if err != nil {
		t.Fatalf("NewResolver returned error: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "http://internal.local/api/auth/oidc/login", nil)
	req.Host = "internal.local"
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "ui.example.com")
	ctx.Request = resolver.Enrich(req)

	if got := computeOIDCCallbackURL(ctx); got != "https://ui.example.com/api/auth/oidc/callback" {
		t.Fatalf("expected callback URL to use trusted forwarded headers, got %q", got)
	}
}
