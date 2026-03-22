package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPendingMFASessionLifecycle(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx.Request = req

	if err := createPendingMFASession(ctx, "alice", true); err != nil {
		t.Fatalf("createPendingMFASession returned error: %v", err)
	}

	cookies := recorder.Result().Cookies()
	if len(cookies) < 2 {
		t.Fatalf("expected pending MFA cookie and csrf cookie, got %d", len(cookies))
	}

	var pendingCookie *http.Cookie
	var sawCSRF bool
	for _, cookie := range cookies {
		switch cookie.Name {
		case pendingMFACookieName:
			pendingCookie = cookie
		case csrfCookieName:
			sawCSRF = true
			if cookie.HttpOnly {
				t.Fatal("expected csrf cookie to be readable by JS")
			}
		}
	}
	if pendingCookie == nil {
		t.Fatal("expected pending MFA cookie to be set")
	}
	if !sawCSRF {
		t.Fatal("expected csrf cookie to be set for MFA session")
	}

	readRecorder := httptest.NewRecorder()
	readCtx, _ := gin.CreateTestContext(readRecorder)
	readReq := httptest.NewRequest(http.MethodGet, "/", nil)
	readReq.AddCookie(pendingCookie)
	readCtx.Request = readReq

	sessionID, session, err := readPendingMFASession(readCtx)
	if err != nil {
		t.Fatalf("readPendingMFASession returned error: %v", err)
	}

	if sessionID == "" {
		t.Fatal("expected non-empty session ID")
	}

	if session.Username != "alice" {
		t.Fatalf("expected username alice, got %q", session.Username)
	}

	if !session.RememberMe {
		t.Fatal("expected rememberMe to be true")
	}

	clearRecorder := httptest.NewRecorder()
	clearCtx, _ := gin.CreateTestContext(clearRecorder)
	clearReq := httptest.NewRequest(http.MethodGet, "/", nil)
	clearReq.AddCookie(pendingCookie)
	clearCtx.Request = clearReq
	clearPendingMFASession(clearCtx)

	if _, _, err := readPendingMFASession(readCtx); err == nil {
		t.Fatal("expected cleared pending MFA session to be unavailable")
	}
}
