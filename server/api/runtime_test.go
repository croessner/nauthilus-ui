package api

import "testing"

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
