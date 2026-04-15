package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestStartPendingMFALoginClearsExistingAuthCookies(t *testing.T) {
	gin.SetMode(gin.TestMode)

	staleRecorder := httptest.NewRecorder()
	staleCtx, _ := gin.CreateTestContext(staleRecorder)
	staleReq := httptest.NewRequest(http.MethodGet, "/", nil)
	staleCtx.Request = staleReq

	if err := createPendingMFASession(staleCtx, "stale-user", false); err != nil {
		t.Fatalf("createPendingMFASession returned error: %v", err)
	}

	var stalePendingCookie *http.Cookie
	for _, cookie := range staleRecorder.Result().Cookies() {
		if cookie.Name == pendingMFACookieName {
			stalePendingCookie = cookie
			break
		}
	}
	if stalePendingCookie == nil {
		t.Fatal("expected stale pending MFA cookie to be set")
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: accessCookieName, Value: "existing-access"})
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "existing-refresh"})
	req.AddCookie(stalePendingCookie)
	ctx.Request = req

	if err := startPendingMFALogin(ctx, nil, "alice", true); err != nil {
		t.Fatalf("startPendingMFALogin returned error: %v", err)
	}

	var (
		sawClearedAccess  bool
		sawClearedRefresh bool
		sawCSRF           bool
		newPendingCookie  *http.Cookie
	)

	for _, cookie := range recorder.Result().Cookies() {
		switch cookie.Name {
		case accessCookieName:
			sawClearedAccess = cookie.Value == "" && cookie.MaxAge < 0
		case refreshCookieName:
			sawClearedRefresh = cookie.Value == "" && cookie.MaxAge < 0
		case csrfCookieName:
			sawCSRF = cookie.Value != ""
		case pendingMFACookieName:
			if cookie.Value != "" && cookie.MaxAge > 0 {
				newPendingCookie = cookie
			}
		}
	}

	if !sawClearedAccess {
		t.Fatal("expected existing access cookie to be cleared before MFA challenge")
	}
	if !sawClearedRefresh {
		t.Fatal("expected existing refresh cookie to be cleared before MFA challenge")
	}
	if !sawCSRF {
		t.Fatal("expected a fresh csrf cookie for the new MFA challenge")
	}
	if newPendingCookie == nil {
		t.Fatal("expected a new pending MFA cookie to be issued")
	}
	if newPendingCookie.Value == stalePendingCookie.Value {
		t.Fatal("expected pending MFA cookie to rotate when starting a new challenge")
	}

	readRecorder := httptest.NewRecorder()
	readCtx, _ := gin.CreateTestContext(readRecorder)
	readReq := httptest.NewRequest(http.MethodGet, "/", nil)
	readReq.AddCookie(newPendingCookie)
	readCtx.Request = readReq

	sessionID, session, err := readPendingMFASession(readCtx)
	if err != nil {
		t.Fatalf("readPendingMFASession returned error: %v", err)
	}
	if sessionID == "" {
		t.Fatal("expected non-empty session ID")
	}
	if session.Username != "alice" {
		t.Fatalf("expected pending MFA username alice, got %q", session.Username)
	}
	if !session.RememberMe {
		t.Fatal("expected rememberMe to be preserved on pending MFA session")
	}

	staleReadRecorder := httptest.NewRecorder()
	staleReadCtx, _ := gin.CreateTestContext(staleReadRecorder)
	staleReadReq := httptest.NewRequest(http.MethodGet, "/", nil)
	staleReadReq.AddCookie(stalePendingCookie)
	staleReadCtx.Request = staleReadReq

	if _, _, err := readPendingMFASession(staleReadCtx); err == nil {
		t.Fatal("expected stale pending MFA session to be invalidated")
	}
}
