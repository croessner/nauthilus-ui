package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAuthCSRFIssuesReadableCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := &AuthHandler{}
	router := gin.New()
	router.GET("/api/auth/csrf", handler.CSRF)

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/csrf", nil)
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("expected Cache-Control no-store, got %q", got)
	}

	var sawCSRF bool
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name != csrfCookieName {
			continue
		}

		sawCSRF = true
		if cookie.HttpOnly {
			t.Fatal("expected csrf cookie to be readable by JS")
		}
		if cookie.Value == "" {
			t.Fatal("expected csrf cookie value to be set")
		}
	}

	if !sawCSRF {
		t.Fatal("expected csrf cookie to be issued")
	}
}
