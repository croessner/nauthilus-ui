package utils

import (
	"net/http"
	"strings"
	"testing"
)

func TestRedactQueryStringMasksSensitiveValues(t *testing.T) {
	raw := "url=https%3A%2F%2Fexample.test&authType=bearer&authValue=secret-token&token=abc123&foo=bar"
	safe := RedactQueryString(raw)

	for _, fragment := range []string{"secret-token", "abc123"} {
		if strings.Contains(safe, fragment) {
			t.Fatalf("expected query string to redact %q, got %s", fragment, safe)
		}
	}

	if !strings.Contains(safe, "foo=bar") {
		t.Fatalf("expected non-sensitive query params to remain, got %s", safe)
	}
}

func TestRedactHeadersMasksSensitiveHeaders(t *testing.T) {
	headers := http.Header{
		"Authorization": []string{"Bearer secret-token"},
		"Cookie":        []string{"nauthilus_ui_session=secret-cookie"},
		"X-Auth-Type":   []string{"bearer"},
		"X-Auth-Value":  []string{"backend-secret"},
	}

	safe := RedactHeaders(headers)

	if got := safe["Authorization"][0]; got != redactedValue {
		t.Fatalf("expected Authorization to be redacted, got %q", got)
	}
	if got := safe["Cookie"][0]; got != redactedValue {
		t.Fatalf("expected Cookie to be redacted, got %q", got)
	}
	if got := safe["X-Auth-Value"][0]; got != redactedValue {
		t.Fatalf("expected X-Auth-Value to be redacted, got %q", got)
	}
	if got := safe["X-Auth-Type"][0]; got != "bearer" {
		t.Fatalf("expected X-Auth-Type to remain visible, got %q", got)
	}
}
