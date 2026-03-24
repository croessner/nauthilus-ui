package proxy

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
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

// TestPingProxyForwardsBackendAuthorizationHeaders verifies that the proxy
// correctly injects backend Authorization headers.  AllowPrivateTargets is set
// to true so the SSRF protection does not block the httptest.Server on loopback.
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
	(&ProxyHandler{AllowPrivateTargets: true}).RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/proxy/ping?url="+url.QueryEscape(backend.URL), nil)
	req.Header.Set("x-auth-type", "bearer")
	req.Header.Set("x-auth-value", "secret-token")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
}

func TestPingProxyUsesDBAllowlistWhenOriginMatches(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var backendCalls int32
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&backendCalls, 1)

		if r.URL.Path != "/ping" {
			t.Fatalf("expected backend path /ping, got %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret-token" {
			t.Fatalf("expected Authorization header to be forwarded, got %q", got)
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	handler := &ProxyHandler{
		allowedOriginLookup: func(_ context.Context, username string) ([]string, error) {
			if username != "alice" {
				t.Fatalf("expected username alice, got %q", username)
			}

			return []string{backend.URL}, nil
		},
	}

	router := gin.New()
	router.Use(func(ctx *gin.Context) {
		ctx.Set("username", "alice")
		ctx.Next()
	})
	handler.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/proxy/ping?url="+url.QueryEscape(backend.URL), nil)
	req.Header.Set("x-auth-type", "bearer")
	req.Header.Set("x-auth-value", "secret-token")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
	if got := atomic.LoadInt32(&backendCalls); got != 1 {
		t.Fatalf("expected backend to be called once, got %d", got)
	}
}

func TestPingProxyRejectsTargetOutsideDBAllowlist(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var backendCalls int32
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&backendCalls, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	handler := &ProxyHandler{
		allowedOriginLookup: func(_ context.Context, _ string) ([]string, error) {
			return []string{"https://allowed.example.com"}, nil
		},
	}

	router := gin.New()
	router.Use(func(ctx *gin.Context) {
		ctx.Set("username", "alice")
		ctx.Next()
	})
	handler.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/proxy/ping?url="+url.QueryEscape(backend.URL), nil)
	req.Header.Set("x-auth-type", "bearer")
	req.Header.Set("x-auth-value", "secret-token")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", recorder.Code)
	}
	if got := atomic.LoadInt32(&backendCalls); got != 0 {
		t.Fatalf("expected backend not to be called, got %d calls", got)
	}
	if !strings.Contains(recorder.Body.String(), "configured backend allowlist") {
		t.Fatalf("expected allowlist error message, got %q", recorder.Body.String())
	}
}

func TestPingProxyFailsClosedWhenDBAllowlistLookupErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var backendCalls int32
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&backendCalls, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	handler := &ProxyHandler{
		allowedOriginLookup: func(_ context.Context, _ string) ([]string, error) {
			return nil, errors.New("lookup unavailable")
		},
	}

	router := gin.New()
	router.Use(func(ctx *gin.Context) {
		ctx.Set("username", "alice")
		ctx.Next()
	})
	handler.RegisterRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/proxy/ping?url="+url.QueryEscape(backend.URL), nil)
	req.Header.Set("x-auth-type", "bearer")
	req.Header.Set("x-auth-value", "secret-token")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", recorder.Code)
	}
	if got := atomic.LoadInt32(&backendCalls); got != 0 {
		t.Fatalf("expected backend not to be called, got %d calls", got)
	}
	if !strings.Contains(recorder.Body.String(), "allowlist lookup failed") {
		t.Fatalf("expected lookup error message, got %q", recorder.Body.String())
	}
}

func TestValidateProxyTargetURLBlocksPrivateIPs(t *testing.T) {
	blocked := []string{
		"http://127.0.0.1/secret",
		"http://127.1.2.3:8080/path",
		"http://10.0.0.1/admin",
		"http://172.16.0.1/data",
		"http://192.168.1.1/router",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/v1",
		"http://localhost/app",
		"http://localhost.localdomain/app",
		"file:///etc/passwd",
		"gopher://internal/ssrf",
	}

	for _, rawURL := range blocked {
		if err := validateProxyTargetURL(rawURL); err == nil {
			t.Errorf("expected %q to be blocked, but it was allowed", rawURL)
		}
	}
}

func TestValidateProxyTargetURLAllowsPublicURLs(t *testing.T) {
	allowed := []string{
		"https://nauthilus.example.com/oidc/token",
		"http://203.0.113.10:8080/api",
		"https://auth.provider.io/token",
	}

	for _, rawURL := range allowed {
		if err := validateProxyTargetURL(rawURL); err != nil {
			t.Errorf("expected %q to be allowed, got error: %v", rawURL, err)
		}
	}
}

func TestIsOriginAllowedMatchesConfiguredBackend(t *testing.T) {
	allowed := []string{"https://nauthilus.example.com"}

	cases := []struct {
		rawURL  string
		allowed bool
	}{
		// Same origin — only path differs (proxy always overrides path)
		{"https://nauthilus.example.com/oidc/token", true},
		{"https://nauthilus.example.com/ping", true},
		{"https://nauthilus.example.com", true},
		// Different host
		{"https://evil.example.com/oidc/token", false},
		// Different scheme
		{"http://nauthilus.example.com/oidc/token", false},
		// Internal target not in allowlist
		{"http://169.254.169.254/latest/meta-data/", false},
		// Empty allowlist
	}

	for _, tc := range cases {
		got := isOriginAllowed(tc.rawURL, allowed)
		if got != tc.allowed {
			t.Errorf("isOriginAllowed(%q) = %v, want %v", tc.rawURL, got, tc.allowed)
		}
	}
}

func TestIsOriginAllowedEmptyAllowlistDeniesAll(t *testing.T) {
	urls := []string{
		"https://nauthilus.example.com/api",
		"http://203.0.113.1/ping",
	}

	for _, rawURL := range urls {
		if isOriginAllowed(rawURL, nil) {
			t.Errorf("expected empty allowlist to deny %q", rawURL)
		}
		if isOriginAllowed(rawURL, []string{}) {
			t.Errorf("expected empty allowlist to deny %q", rawURL)
		}
	}
}

func TestResolveRuntimeBackendAuthPrefersOIDCToken(t *testing.T) {
	connection := map[string]interface{}{
		"backend_url": "https://backend.example.com",
		"basic_auth": map[string]interface{}{
			"enabled":  true,
			"username": "alice",
			"password": "secret",
		},
		"oidc_auth": map[string]interface{}{
			"enabled": true,
			"token":   "oidc-token",
		},
	}

	backendURL, authType, authValue, err := resolveRuntimeBackendAuth(connection)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if backendURL != "https://backend.example.com" {
		t.Fatalf("unexpected backend URL: %q", backendURL)
	}
	if authType != "bearer" {
		t.Fatalf("expected bearer auth type, got %q", authType)
	}
	if authValue != "oidc-token" {
		t.Fatalf("expected oidc token auth value, got %q", authValue)
	}
}

func TestResolveRuntimeBackendAuthUsesBasicFallback(t *testing.T) {
	connection := map[string]interface{}{
		"backend_url": "https://backend.example.com",
		"basic_auth": map[string]interface{}{
			"enabled":  true,
			"username": "alice",
			"password": "secret",
		},
	}

	_, authType, authValue, err := resolveRuntimeBackendAuth(connection)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if authType != "basic" {
		t.Fatalf("expected basic auth type, got %q", authType)
	}

	want := base64.StdEncoding.EncodeToString([]byte("alice:secret"))
	if authValue != want {
		t.Fatalf("expected base64 basic auth value %q, got %q", want, authValue)
	}
}

func TestHookExecuteProxyUsesServerSideAuthAndReturnsRedactedPreview(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var receivedAuthorization string
	var receivedXCustom string

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuthorization = r.Header.Get("Authorization")
		receivedXCustom = r.Header.Get("X-Custom")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer backend.Close()

	handler := &ProxyHandler{
		AllowPrivateTargets: true,
		activeRuntimeConnectionLookup: func(_ context.Context, username string) (map[string]interface{}, string, error) {
			if username != "alice" {
				t.Fatalf("expected username alice, got %q", username)
			}

			return map[string]interface{}{
				"backend_url": backend.URL,
				"oidc_auth": map[string]interface{}{
					"enabled": true,
					"token":   "backend-token",
				},
			}, "Default", nil
		},
	}

	router := gin.New()
	router.Use(func(ctx *gin.Context) {
		ctx.Set("username", "alice")
		ctx.Next()
	})
	handler.RegisterRoutes(router)

	payload := map[string]interface{}{
		"method":       "GET",
		"endpointPath": "/api/v1/custom/hooks/hello",
		"query": []map[string]string{
			{"key": "action", "value": "run"},
		},
		"headers": []map[string]string{
			{"key": "Authorization", "value": "Bearer should-not-pass"},
			{"key": "X-Custom", "value": "demo"},
		},
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/proxy/hooks/execute", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if receivedAuthorization != "Bearer backend-token" {
		t.Fatalf("expected backend auth from runtime settings, got %q", receivedAuthorization)
	}
	if receivedXCustom != "demo" {
		t.Fatalf("expected forwarded custom header, got %q", receivedXCustom)
	}

	var response struct {
		Request struct {
			Headers []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"headers"`
		} `json:"request"`
		Response struct {
			Status int `json:"status"`
		} `json:"response"`
	}

	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response JSON: %v", err)
	}
	if response.Response.Status != http.StatusOK {
		t.Fatalf("expected backend response status 200 in payload, got %d", response.Response.Status)
	}

	var gotRedactedAuth bool
	for _, header := range response.Request.Headers {
		if strings.EqualFold(header.Name, "Authorization") && header.Value == "[REDACTED]" {
			gotRedactedAuth = true
			break
		}
	}
	if !gotRedactedAuth {
		t.Fatalf("expected redacted Authorization header in request preview, got %+v", response.Request.Headers)
	}
}
