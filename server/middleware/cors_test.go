package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
)

func TestCORSAllowsExplicitOriginAndSetsVary(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCORSHandler(&config.Config{
		CORSAllowedOrigins: []string{"https://ui.example.com"},
	}).RegisterMiddleware(router)
	router.GET("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://ui.example.com")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", recorder.Code)
	}

	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://ui.example.com" {
		t.Fatalf("expected Access-Control-Allow-Origin to match request origin, got %q", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("expected credentials support, got %q", got)
	}

	for _, expected := range []string{"Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"} {
		found := false
		for _, header := range recorder.Header().Values("Vary") {
			if header == expected {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected Vary to include %q", expected)
		}
	}
}

func TestCORSRejectsDisallowedOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCORSHandler(&config.Config{
		CORSAllowedOrigins: []string{"https://ui.example.com"},
	}).RegisterMiddleware(router)
	router.OPTIONS("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for disallowed origin, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no allow-origin header for disallowed origin, got %q", got)
	}
}

func TestCORSAllowsLocalDefaults(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCORSHandler(&config.Config{
		FrontendPort: "3001",
		ProxyPort:    "3002",
	}).RegisterMiddleware(router)
	router.OPTIONS("/proxy/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodOptions, "/proxy/test", nil)
	req.Header.Set("Origin", "http://localhost:3001")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 for local default origin, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3001" {
		t.Fatalf("expected local origin to be allowed, got %q", got)
	}
}

func TestCORSAllowsDefaultViteDevOriginWithZeroConfig(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCORSHandler(&config.Config{}).RegisterMiddleware(router)
	router.OPTIONS("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 for vite dev origin, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("expected vite dev origin to be allowed, got %q", got)
	}
}

func TestCORSExplicitAllowlistDisablesImplicitLocalDefaults(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCORSHandler(&config.Config{
		CORSAllowedOrigins: []string{"https://ui.example.com"},
	}).RegisterMiddleware(router)
	router.OPTIONS("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 when explicit allowlist excludes localhost, got %d", recorder.Code)
	}
}

func TestCORSInvalidExplicitAllowlistDoesNotFallbackToDefaults(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCORSHandler(&config.Config{
		CORSAllowedOrigins: []string{"not-a-valid-origin"},
	}).RegisterMiddleware(router)
	router.OPTIONS("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 when explicit allowlist is invalid, got %d", recorder.Code)
	}
}
