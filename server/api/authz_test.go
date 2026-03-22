package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequireAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		username   string
		roles      []string
		wantStatus int
	}{
		{name: "admin allowed", username: "alice", roles: []string{"admin"}, wantStatus: http.StatusNoContent},
		{name: "non-admin denied", username: "alice", roles: []string{"user"}, wantStatus: http.StatusForbidden},
		{name: "missing auth context denied", username: "", roles: nil, wantStatus: http.StatusUnauthorized},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/protected", func(ctx *gin.Context) {
				if testCase.username != "" {
					ctx.Set("username", testCase.username)
				}
				if testCase.roles != nil {
					ctx.Set("roles", testCase.roles)
				}
				ctx.Next()
			}, RequireAdmin(), func(ctx *gin.Context) {
				ctx.Status(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != testCase.wantStatus {
				t.Fatalf("expected status %d, got %d", testCase.wantStatus, recorder.Code)
			}
		})
	}
}

func TestRequireSelfOrAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		username   string
		roles      []string
		targetUser string
		wantStatus int
	}{
		{name: "self allowed", username: "alice", roles: []string{"user"}, targetUser: "alice", wantStatus: http.StatusNoContent},
		{name: "admin allowed", username: "admin", roles: []string{"admin"}, targetUser: "alice", wantStatus: http.StatusNoContent},
		{name: "other user denied", username: "bob", roles: []string{"user"}, targetUser: "alice", wantStatus: http.StatusForbidden},
		{name: "missing auth context denied", username: "", roles: nil, targetUser: "alice", wantStatus: http.StatusUnauthorized},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/profiles/:userId", func(ctx *gin.Context) {
				if testCase.username != "" {
					ctx.Set("username", testCase.username)
				}
				if testCase.roles != nil {
					ctx.Set("roles", testCase.roles)
				}
				ctx.Next()
			}, RequireSelfOrAdmin("userId"), func(ctx *gin.Context) {
				ctx.Status(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodGet, "/profiles/"+testCase.targetUser, nil)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != testCase.wantStatus {
				t.Fatalf("expected status %d, got %d", testCase.wantStatus, recorder.Code)
			}
		})
	}
}
