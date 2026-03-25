package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/integrations/sshprovider"
)

func TestValidateBackendURL(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		rawURL  string
		wantErr bool
	}{
		{name: "empty is allowed", rawURL: "", wantErr: false},
		{name: "http is allowed", rawURL: "http://example.com", wantErr: false},
		{name: "https with port and path is allowed", rawURL: "https://Example.COM:8443/api/v1", wantErr: false},
		{name: "missing scheme is rejected", rawURL: "example.com", wantErr: true},
		{name: "unsupported scheme is rejected", rawURL: "ftp://example.com", wantErr: true},
		{name: "missing host is rejected", rawURL: "https:///api", wantErr: true},
		{name: "invalid URL is rejected", rawURL: "://bad", wantErr: true},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			err := validateBackendURL(tc.rawURL)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error for %q, got nil", tc.rawURL)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error for %q, got %v", tc.rawURL, err)
			}
		})
	}
}

func TestValidateRuntimeConnection(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		connection map[string]interface{}
		wantErr    bool
	}{
		{name: "nil connection", connection: nil, wantErr: false},
		{name: "missing backend_url key", connection: map[string]interface{}{"foo": "bar"}, wantErr: false},
		{name: "valid backend_url", connection: map[string]interface{}{"backend_url": "https://example.com"}, wantErr: false},
		{name: "empty backend_url", connection: map[string]interface{}{"backend_url": ""}, wantErr: false},
		{name: "invalid backend_url value", connection: map[string]interface{}{"backend_url": "not-a-url"}, wantErr: true},
		{name: "non-string backend_url", connection: map[string]interface{}{"backend_url": 123}, wantErr: true},
		{
			name: "valid ssh tunnel settings",
			connection: map[string]interface{}{
				"backend_url": "https://example.com",
				"ssh_tunnel": map[string]interface{}{
					"enabled":       true,
					"remote_target": "bastion.example.com",
					"remote_port":   22,
				},
			},
			wantErr: false,
		},
		{
			name: "ssh tunnel missing target",
			connection: map[string]interface{}{
				"backend_url": "https://example.com",
				"ssh_tunnel": map[string]interface{}{
					"enabled":     true,
					"remote_port": 22,
				},
			},
			wantErr: true,
		},
		{
			name: "ssh tunnel invalid port",
			connection: map[string]interface{}{
				"backend_url": "https://example.com",
				"ssh_tunnel": map[string]interface{}{
					"enabled":       true,
					"remote_target": "bastion.example.com",
					"remote_port":   70000,
				},
			},
			wantErr: true,
		},
		{
			name: "ssh tunnel invalid without backend_url still rejected",
			connection: map[string]interface{}{
				"ssh_tunnel": map[string]interface{}{
					"enabled":       true,
					"remote_target": "bastion.example.com",
					"remote_port":   70000,
				},
			},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			err := validateRuntimeConnection(tc.connection)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestIsRuntimeSSHTunnelEnabled(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		connection map[string]interface{}
		want       bool
	}{
		{
			name:       "missing tunnel",
			connection: map[string]interface{}{},
			want:       false,
		},
		{
			name: "disabled tunnel",
			connection: map[string]interface{}{
				"ssh_tunnel": map[string]interface{}{"enabled": false},
			},
			want: false,
		},
		{
			name: "enabled tunnel bool",
			connection: map[string]interface{}{
				"ssh_tunnel": map[string]interface{}{"enabled": true},
			},
			want: true,
		},
		{
			name: "enabled tunnel string",
			connection: map[string]interface{}{
				"ssh_tunnel": map[string]interface{}{"enabled": "yes"},
			},
			want: true,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := isRuntimeSSHTunnelEnabled(tc.connection)
			if got != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}

func TestRuntimeGetCapabilities(t *testing.T) {
	gin.SetMode(gin.TestMode)

	provider := sshprovider.NewProvider(120, []sshprovider.UserMapping{
		{
			Username:       "alice",
			SSHUser:        "ops",
			PrivateKeyPath: "/tmp/alice_id_ed25519",
			KnownHostsPath: "/tmp/known_hosts",
		},
	})

	cases := []struct {
		name     string
		username string
		handler  *RuntimeHandler
		wantSSH  bool
		wantTTL  int
	}{
		{
			name:     "mapped runtime ssh user",
			username: "alice",
			handler:  NewRuntimeHandler(&db.MongoDB{}, provider),
			wantSSH:  true,
			wantTTL:  120,
		},
		{
			name:     "unmapped runtime ssh user",
			username: "bob",
			handler:  NewRuntimeHandler(&db.MongoDB{}, provider),
			wantSSH:  false,
			wantTTL:  120,
		},
		{
			name:     "no runtime ssh provider",
			username: "alice",
			handler:  NewRuntimeHandler(&db.MongoDB{}, nil),
			wantSSH:  false,
			wantTTL:  -1,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/runtime/capabilities", nil)
			ctx.Set("username", tc.username)

			tc.handler.GetCapabilities(ctx)

			if recorder.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", recorder.Code)
			}

			var payload runtimeCapabilitiesResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
				t.Fatalf("failed to decode capabilities response: %v", err)
			}

			if payload.SSHAvailable != tc.wantSSH {
				t.Fatalf("expected sshAvailable=%v, got %v", tc.wantSSH, payload.SSHAvailable)
			}
			if payload.PassphraseCacheSeconds != tc.wantTTL {
				t.Fatalf("expected passphraseCacheSeconds=%d, got %d", tc.wantTTL, payload.PassphraseCacheSeconds)
			}
		})
	}
}

func TestSaveRuntimeSettingsRejectsSSHTunnelWithoutUserMapping(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewRuntimeHandler(
		&db.MongoDB{IsConnected: false},
		sshprovider.NewProvider(60, nil),
	)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/runtime/alice/default",
		strings.NewReader(`{
			"connection": {
				"backend_url": "https://backend.example.com",
				"ssh_tunnel": {
					"enabled": true,
					"remote_target": "bastion.example.com",
					"remote_port": 22
				}
			},
			"hooks": {}
		}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("username", "alice")

	handler.SaveRuntimeSettings(ctx)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d with body %q", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "No SSH key is configured for the current user") {
		t.Fatalf("expected missing mapping error, got %q", recorder.Body.String())
	}
}
