package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
)

func TestSecurityHeadersSetBaselinePolicies(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewSecurityHeadersHandler(&config.Config{
		Server: config.ServerConfig{
			Proxy: config.ProxyConfig{PublicPort: 3002},
		},
	}).RegisterMiddleware(router)
	router.GET("/", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("expected nosniff header, got %q", got)
	}
	if got := recorder.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("expected X-Frame-Options DENY, got %q", got)
	}
	if got := recorder.Header().Get("Referrer-Policy"); got != referrerPolicyValue {
		t.Fatalf("expected referrer policy %q, got %q", referrerPolicyValue, got)
	}
	if got := recorder.Header().Get("Permissions-Policy"); got != permissionsPolicyValue {
		t.Fatalf("expected permissions policy %q, got %q", permissionsPolicyValue, got)
	}

	csp := recorder.Header().Get("Content-Security-Policy")
	for _, expected := range []string{
		"default-src 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
	} {
		if !strings.Contains(csp, expected) {
			t.Fatalf("expected CSP to contain %q, got %q", expected, csp)
		}
	}
	if strings.Contains(csp, "script-src 'unsafe-inline'") {
		t.Fatalf("expected CSP script-src without unsafe-inline, got %q", csp)
	}
	if got := recorder.Header().Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("expected no HSTS on insecure request, got %q", got)
	}
}

func TestSecurityHeadersIgnoreUntrustedForwardedProto(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewRequestContextHandler(&config.Config{
		Server: config.ServerConfig{
			TrustedProxies: []string{"127.0.0.1"},
			Proxy:          config.ProxyConfig{PublicPort: 3002},
		},
	}).RegisterMiddleware(router)
	NewSecurityHeadersHandler(&config.Config{
		Server: config.ServerConfig{
			Proxy: config.ProxyConfig{PublicPort: 3002},
		},
	}).RegisterMiddleware(router)
	router.GET("/", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.RemoteAddr = "198.51.100.25:1234"
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if got := recorder.Header().Get("Strict-Transport-Security"); got != "" {
		t.Fatalf("expected no HSTS for untrusted forwarded proto, got %q", got)
	}
}

func TestSecurityHeadersSetHSTSForTrustedSecureRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewRequestContextHandler(&config.Config{
		Server: config.ServerConfig{
			TrustedProxies: []string{"127.0.0.1"},
			Proxy:          config.ProxyConfig{PublicPort: 3002},
		},
	}).RegisterMiddleware(router)
	NewSecurityHeadersHandler(&config.Config{
		Server: config.ServerConfig{
			Proxy: config.ProxyConfig{PublicPort: 3002},
		},
	}).RegisterMiddleware(router)
	router.GET("/", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.RemoteAddr = "127.0.0.1:1234"
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if got := recorder.Header().Get("Strict-Transport-Security"); got != hstsValue {
		t.Fatalf("expected HSTS %q, got %q", hstsValue, got)
	}
}

func TestSecurityHeadersAllowProxyOriginInConnectSrc(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewSecurityHeadersHandler(&config.Config{
		Server: config.ServerConfig{
			Proxy: config.ProxyConfig{PublicPort: 3002},
		},
	}).RegisterMiddleware(router)
	router.GET("/", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "http://localhost:3001/", nil)
	req.Host = "localhost:3001"
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	csp := recorder.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "connect-src") {
		t.Fatalf("expected CSP to contain connect-src directive, got %q", csp)
	}

	if !strings.Contains(csp, "http://localhost:3002") {
		t.Fatalf("expected CSP connect-src to allow proxy origin, got %q", csp)
	}
}
