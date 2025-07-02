package utils

import (
	"net/http"
	"strings"
)

// AddAuthorizationHeader adds authorization headers to proxy requests
func AddAuthorizationHeader(req *http.Request, authType, authValue string) {
	if authType == "basic" && authValue != "" {
		req.Header.Set("Authorization", "Basic "+authValue)
	} else if authType == "bearer" && authValue != "" {
		req.Header.Set("Authorization", "Bearer "+authValue)
	}
}

// GetAuthorizationFromQuery extracts authorization information from query parameters
func GetAuthorizationFromQuery(req *http.Request) (string, string) {
	authType := req.URL.Query().Get("authType")
	authValue := req.URL.Query().Get("authValue")

	return strings.ToLower(authType), authValue
}
