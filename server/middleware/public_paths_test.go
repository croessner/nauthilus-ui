package middleware

import "testing"

func TestIsPublicPath(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{path: "/api/auth/csrf", want: true},
		{path: "/api/auth/login", want: true},
		{path: "/api/auth/totp/verify", want: true},
		{path: "/api/auth/webauthn/begin-login", want: true},
		{path: "/api/auth/webauthn/finish-login", want: true},
		{path: "/api/auth/oidc/callback", want: true},
		{path: "/api/health", want: true},
		{path: "/api/i18n/en", want: true},
		{path: "/api/auth/totp/setup", want: false},
		{path: "/api/auth/totp/disable", want: false},
		{path: "/api/auth/webauthn/begin-registration", want: false},
		{path: "/api/auth/webauthn/credential/abc", want: false},
		{path: "/api/users", want: false},
	}

	for _, testCase := range tests {
		if got := IsPublicPath(testCase.path); got != testCase.want {
			t.Fatalf("path %q: expected %t, got %t", testCase.path, testCase.want, got)
		}
	}
}
