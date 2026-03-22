package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequireAuthenticatedMFAUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		currentUser    string
		currentRoles   []string
		requestedUser  string
		wantStatus     int
		wantActor      string
		wantTargetUser string
	}{
		{
			name:           "self allowed",
			currentUser:    "alice",
			currentRoles:   []string{"user"},
			requestedUser:  "alice",
			wantStatus:     http.StatusNoContent,
			wantActor:      "alice",
			wantTargetUser: "alice",
		},
		{
			name:           "admin may target other user",
			currentUser:    "admin",
			currentRoles:   []string{"admin"},
			requestedUser:  "alice",
			wantStatus:     http.StatusNoContent,
			wantActor:      "admin",
			wantTargetUser: "alice",
		},
		{
			name:          "non admin denied for other user",
			currentUser:   "bob",
			currentRoles:  []string{"user"},
			requestedUser: "alice",
			wantStatus:    http.StatusForbidden,
		},
		{
			name:          "missing auth denied",
			requestedUser: "alice",
			wantStatus:    http.StatusUnauthorized,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			handler := &MFAHandler{}
			router := gin.New()
			router.GET("/mfa", func(ctx *gin.Context) {
				if testCase.currentUser != "" {
					ctx.Set("username", testCase.currentUser)
				}
				if testCase.currentRoles != nil {
					ctx.Set("roles", testCase.currentRoles)
				}
				ctx.Next()
			}, func(ctx *gin.Context) {
				actor, targetUser, ok := handler.requireAuthenticatedMFAUser(ctx, testCase.requestedUser)
				if !ok {
					return
				}
				if actor != testCase.wantActor {
					t.Fatalf("expected actor %q, got %q", testCase.wantActor, actor)
				}
				if targetUser != testCase.wantTargetUser {
					t.Fatalf("expected target user %q, got %q", testCase.wantTargetUser, targetUser)
				}
				ctx.Status(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodGet, "/mfa", nil)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != testCase.wantStatus {
				t.Fatalf("expected status %d, got %d", testCase.wantStatus, recorder.Code)
			}
		})
	}
}
