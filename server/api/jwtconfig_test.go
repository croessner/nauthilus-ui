package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/config"
	"nauthilus-ui/server/db"
)

func TestGetJWTConfigOmitsSecretWhenDisconnected(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewJWTConfigHandler(&db.MongoDB{
		Config: &config.Config{
			JWTSecret:          "super-secret",
			TokenExpiry:        3600,
			RefreshTokenExpiry: 7200,
			RememberMeExpiry:   86400,
		},
		IsConnected: false,
	})

	router := gin.New()
	router.GET("/api/jwtconfig", func(ctx *gin.Context) {
		ctx.Set("username", "admin")
		ctx.Set("roles", []string{"admin"})
		ctx.Next()
	}, RequireAdmin(), handler.GetJWTConfig)

	req := httptest.NewRequest(http.MethodGet, "/api/jwtconfig", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	if strings.Contains(body, "super-secret") || strings.Contains(body, "\"jwtSecret\":") {
		t.Fatalf("expected response to omit jwtSecret, got %s", body)
	}

	var response struct {
		JWTConfig struct {
			TokenExpiry         int  `json:"tokenExpiry"`
			RefreshTokenExpiry  int  `json:"refreshTokenExpiry"`
			RememberMeExpiry    int  `json:"rememberMeExpiry"`
			JWTSecretConfigured bool `json:"jwtSecretConfigured"`
		} `json:"jwtConfig"`
	}

	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("json.Unmarshal returned error: %v", err)
	}

	if !response.JWTConfig.JWTSecretConfigured {
		t.Fatal("expected jwtSecretConfigured to be true")
	}
}
