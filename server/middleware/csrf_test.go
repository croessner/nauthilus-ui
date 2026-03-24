package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
)

func TestCSRFMiddlewareAllowsCookieAuthenticatedMutationWithTrustedOriginAndMatchingToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCSRFProtection(&config.Config{}).RegisterMiddleware(router)
	router.POST("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set(csrfHeaderName, "csrf-token")
	req.AddCookie(&http.Cookie{Name: accessCookieName, Value: "access"})
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "csrf-token"})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", recorder.Code)
	}
}

func TestCSRFMiddlewareRejectsMissingTokenForCookieSession(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCSRFProtection(&config.Config{}).RegisterMiddleware(router)
	router.POST("/api/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.AddCookie(&http.Cookie{Name: accessCookieName, Value: "access"})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", recorder.Code)
	}
}

func TestCSRFMiddlewareRejectsDisallowedOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCSRFProtection(&config.Config{
		Security: config.SecurityConfig{
			CORS: config.CORSConfig{
				AllowedOrigins: []string{"https://ui.example.com"},
			},
		},
	}).RegisterMiddleware(router)
	router.DELETE("/proxy/test", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodDelete, "/proxy/test", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set(csrfHeaderName, "csrf-token")
	req.AddCookie(&http.Cookie{Name: accessCookieName, Value: "access"})
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "csrf-token"})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", recorder.Code)
	}
}

func TestCSRFMiddlewareSkipsAnonymousMutation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCSRFProtection(&config.Config{}).RegisterMiddleware(router)
	router.POST("/api/auth/login", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", recorder.Code)
	}
}

func TestCSRFMiddlewareBootstrapsCSRFCookieOnSafeRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	NewCSRFProtection(&config.Config{}).RegisterMiddleware(router)
	router.GET("/api/auth/me", func(ctx *gin.Context) {
		ctx.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "refresh"})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", recorder.Code)
	}

	var sawCSRF bool
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == csrfCookieName {
			sawCSRF = true
			if cookie.Value == "" {
				t.Fatal("expected csrf cookie value to be set")
			}
		}
	}

	if !sawCSRF {
		t.Fatal("expected csrf cookie to be bootstrapped")
	}
}
