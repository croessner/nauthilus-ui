package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
	"nauthilus-ui/server/db"
)

func TestGetSessionConfigWhenDisconnectedUsesRuntimeDefaults(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewSessionConfigHandler(&db.MongoDB{
		Config: &config.Config{
			Session: config.SessionConfig{
				TokenExpirySeconds:        3600,
				RefreshTokenExpirySeconds: 7200,
				RememberMeExpirySeconds:   86400,
			},
		},
		IsConnected: false,
	})

	router := gin.New()
	router.GET("/api/sessionconfig", func(ctx *gin.Context) {
		ctx.Set("username", "admin")
		ctx.Set("roles", []string{"admin"})
		ctx.Next()
	}, RequireAdmin(), handler.GetSessionConfig)

	req := httptest.NewRequest(http.MethodGet, "/api/sessionconfig", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response struct {
		SessionConfig struct {
			TokenExpiry        int `json:"tokenExpiry"`
			RefreshTokenExpiry int `json:"refreshTokenExpiry"`
			RememberMeExpiry   int `json:"rememberMeExpiry"`
		} `json:"sessionConfig"`
	}

	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("json.Unmarshal returned error: %v", err)
	}

	if response.SessionConfig.TokenExpiry != 3600 || response.SessionConfig.RefreshTokenExpiry != 7200 || response.SessionConfig.RememberMeExpiry != 86400 {
		t.Fatalf("unexpected session config response: %+v", response.SessionConfig)
	}
}
