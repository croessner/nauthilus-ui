package utils

import (
	"net/http"
)

// AddAuthorizationHeader adds authorization headers to proxy requests
func AddAuthorizationHeader(req *http.Request, authType, authValue string) {
	if authType == "basic" && authValue != "" {
		req.Header.Set("Authorization", "Basic "+authValue)
	} else if authType == "bearer" && authValue != "" {
		req.Header.Set("Authorization", "Bearer "+authValue)
	}
}
