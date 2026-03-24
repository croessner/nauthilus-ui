package utils

import (
	"net/http"
	"net/url"
	"strings"
)

const redactedValue = "[REDACTED]"

var sensitiveQueryKeys = map[string]struct{}{
	"access_key":       {},
	"access_token":     {},
	"authvalue":        {},
	"client_assertion": {},
	"client_secret":    {},
	"code":             {},
	"id_token":         {},
	"private_key":      {},
	"private_key_pem":  {},
	"refresh_token":    {},
	"refreshtoken":     {},
	"token":            {},
}

var sensitiveHeaderKeys = map[string]struct{}{
	"authorization":       {},
	"cookie":              {},
	"proxy-authorization": {},
	"set-cookie":          {},
	"x-auth-value":        {},
	"x-csrf-token":        {},
}

func isSensitiveQueryKey(key string) bool {
	_, ok := sensitiveQueryKeys[strings.ToLower(strings.TrimSpace(key))]
	return ok
}

func isSensitiveHeaderKey(key string) bool {
	_, ok := sensitiveHeaderKeys[strings.ToLower(strings.TrimSpace(key))]
	return ok
}

// HasLegacyAuthQueryParams reports whether the request still transports backend auth in query params.
func HasLegacyAuthQueryParams(req *http.Request) bool {
	if req == nil || req.URL == nil {
		return false
	}

	q := req.URL.Query()
	return q.Get("authType") != "" || q.Get("authValue") != ""
}

// RedactHeaderValue masks sensitive header values before logging.
func RedactHeaderValue(name, value string) string {
	if value == "" {
		return value
	}

	if isSensitiveHeaderKey(name) {
		return redactedValue
	}

	return value
}

// RedactHeaders returns a log-safe copy of headers.
func RedactHeaders(headers http.Header) map[string][]string {
	if len(headers) == 0 {
		return nil
	}

	safe := make(map[string][]string, len(headers))
	for key, values := range headers {
		masked := make([]string, len(values))
		for i, value := range values {
			masked[i] = RedactHeaderValue(key, value)
		}
		safe[key] = masked
	}

	return safe
}

// RedactQueryString masks known sensitive query parameter values.
func RedactQueryString(raw string) string {
	if raw == "" {
		return ""
	}

	values, err := url.ParseQuery(raw)
	if err != nil {
		return redactedValue
	}

	for key := range values {
		if !isSensitiveQueryKey(key) {
			continue
		}

		for i := range values[key] {
			values[key][i] = redactedValue
		}
	}

	return values.Encode()
}

// RedactPathWithQuery returns a path string with a sanitized query string.
func RedactPathWithQuery(path, rawQuery string) string {
	if rawQuery == "" {
		return path
	}

	return path + "?" + RedactQueryString(rawQuery)
}

// RedactURLString masks userinfo and sensitive query params in a URL string for logs.
func RedactURLString(raw string) string {
	if raw == "" {
		return ""
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		if idx := strings.Index(raw, "?"); idx >= 0 {
			return raw[:idx] + "?" + RedactQueryString(raw[idx+1:])
		}

		return raw
	}

	parsed.User = nil
	parsed.RawQuery = RedactQueryString(parsed.RawQuery)
	return parsed.String()
}
