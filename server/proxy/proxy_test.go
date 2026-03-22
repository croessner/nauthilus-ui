package proxy

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCopyResponseHeadersFiltersBackendCORSHeaders(t *testing.T) {
	dst := http.Header{}
	src := http.Header{}
	src.Add("Content-Type", "application/json")
	src.Add("Vary", "Accept-Encoding")
	src.Add("Access-Control-Allow-Origin", "https://backend.example.com")
	src.Add("Access-Control-Expose-Headers", "X-Backend-Secret")

	copyResponseHeaders(dst, src)

	if got := dst.Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected content-type to be copied, got %q", got)
	}
	if got := dst.Get("Vary"); got != "Accept-Encoding" {
		t.Fatalf("expected vary to be copied, got %q", got)
	}
	if got := dst.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected backend allow-origin header to be stripped, got %q", got)
	}
	if got := dst.Get("Access-Control-Expose-Headers"); got != "" {
		t.Fatalf("expected backend expose-headers to be stripped, got %q", got)
	}
}

func TestPingProxyForwardsBackendAuthorizationHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ping" {
			t.Fatalf("expected backend path /ping, got %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret-token" {
			t.Fatalf("expected Authorization header to be forwarded, got %q", got)
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	router := gin.New()
	NewProxyHandler(nil).RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/proxy/ping?url="+url.QueryEscape(backend.URL), nil)
	req.Header.Set("x-auth-type", "bearer")
	req.Header.Set("x-auth-value", "secret-token")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
}
