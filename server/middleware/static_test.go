package middleware

import (
	"strings"
	"testing"
)

func TestEnsureEnvConfigScriptDoesNotDuplicateExistingScript(t *testing.T) {
	html := `<html><head><script src="/env-config-loader.js"></script></head><body></body></html>`

	got := ensureEnvConfigScript(html)

	if strings.Count(got, `/env-config-loader.js`) != 1 {
		t.Fatalf("expected env-config-loader.js script once, got %q", got)
	}
}

func TestEnsureEnvConfigScriptInjectsBeforeClosingHead(t *testing.T) {
	html := `<html><head><title>App</title></head><body></body></html>`

	got := ensureEnvConfigScript(html)

	if !strings.Contains(got, `<script src="/env-config-loader.js"></script></head>`) {
		t.Fatalf("expected env-config-loader.js script injected before closing head, got %q", got)
	}
}
