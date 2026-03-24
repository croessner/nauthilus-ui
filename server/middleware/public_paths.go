package middleware

import "strings"

// IsPublicPath reports whether the request path is intentionally reachable
// without the standard session middleware.
func IsPublicPath(path string) bool {
	if strings.HasPrefix(path, "/api/health") || strings.HasPrefix(path, "/api/i18n/") {
		return true
	}

	if strings.HasPrefix(path, "/api/auth/oidc/") {
		return true
	}

	switch path {
	case "/api/auth/csrf",
		"/api/auth/login",
		"/api/auth/logout",
		"/api/auth/refresh",
		"/api/auth/totp/verify",
		"/api/auth/webauthn/begin-login",
		"/api/auth/webauthn/finish-login":
		return true
	default:
		return false
	}
}
