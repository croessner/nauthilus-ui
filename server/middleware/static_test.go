package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
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

func TestEnvConfigHandlerIncludesYAMLFlowLevel(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	handler := NewStaticHandler(&config.Config{
		Session: config.SessionConfig{
			TokenExpirySeconds:        3600,
			RefreshTokenExpirySeconds: 86400,
			RememberMeExpirySeconds:   86400,
		},
		UI: config.UIConfig{
			CookieBannerReshowDays: -1,
			RawJSONMaxBytes:        8192,
			YAMLFlowLevel:          3,
		},
	})
	router.GET("/env-config.js", handler.EnvConfigHandler)

	req := httptest.NewRequest(http.MethodGet, "/env-config.js", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if !strings.Contains(recorder.Body.String(), `"REACT_APP_YAML_FLOW_LEVEL":"3"`) {
		t.Fatalf("expected env-config payload to include REACT_APP_YAML_FLOW_LEVEL=3, got %q", recorder.Body.String())
	}
}
