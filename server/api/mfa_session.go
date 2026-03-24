package api

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/requestmeta"
)

const (
	pendingMFACookieName = "nauthilus_ui_mfa_pending"
	pendingMFATTL        = 5 * time.Minute
)

var errPendingMFASessionNotFound = errors.New("pending mfa session not found")

type pendingMFASession struct {
	Username   string
	RememberMe bool
	ExpiresAt  time.Time
}

type pendingMFASessionStore struct {
	mu       sync.Mutex
	sessions map[string]pendingMFASession
}

var globalPendingMFASessions = &pendingMFASessionStore{
	sessions: make(map[string]pendingMFASession),
}

func (s *pendingMFASessionStore) create(username string, rememberMe bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.cleanupExpiredLocked(time.Now())

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	sessionID := base64.RawURLEncoding.EncodeToString(raw)
	s.sessions[sessionID] = pendingMFASession{
		Username:   username,
		RememberMe: rememberMe,
		ExpiresAt:  time.Now().Add(pendingMFATTL),
	}

	return sessionID, nil
}

func (s *pendingMFASessionStore) get(sessionID string) (pendingMFASession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[sessionID]
	if !ok {
		return pendingMFASession{}, errPendingMFASessionNotFound
	}

	if time.Now().After(session.ExpiresAt) {
		delete(s.sessions, sessionID)
		return pendingMFASession{}, errPendingMFASessionNotFound
	}

	return session, nil
}

func (s *pendingMFASessionStore) delete(sessionID string) {
	if sessionID == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionID)
}

func (s *pendingMFASessionStore) cleanupExpiredLocked(now time.Time) {
	for sessionID, session := range s.sessions {
		if now.After(session.ExpiresAt) {
			delete(s.sessions, sessionID)
		}
	}
}

func setPendingMFACookie(ctx *gin.Context, sessionID string) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     pendingMFACookieName,
		Value:    sessionID,
		Path:     "/",
		Expires:  time.Now().Add(pendingMFATTL),
		MaxAge:   int(pendingMFATTL.Seconds()),
		HttpOnly: true,
		Secure:   requestmeta.IsSecureRequest(ctx.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearPendingMFACookie(ctx *gin.Context) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     pendingMFACookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   requestmeta.IsSecureRequest(ctx.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func createPendingMFASession(ctx *gin.Context, username string, rememberMe bool) error {
	sessionID, err := globalPendingMFASessions.create(username, rememberMe)
	if err != nil {
		return err
	}

	if _, err := RotateCSRFCookie(ctx); err != nil {
		return err
	}

	setPendingMFACookie(ctx, sessionID)
	return nil
}

func readPendingMFASession(ctx *gin.Context) (string, pendingMFASession, error) {
	cookie, err := ctx.Request.Cookie(pendingMFACookieName)
	if err != nil || cookie.Value == "" {
		return "", pendingMFASession{}, errPendingMFASessionNotFound
	}

	session, err := globalPendingMFASessions.get(cookie.Value)
	if err != nil {
		clearPendingMFACookie(ctx)
		return "", pendingMFASession{}, err
	}

	return cookie.Value, session, nil
}

func clearPendingMFASession(ctx *gin.Context) {
	if cookie, err := ctx.Request.Cookie(pendingMFACookieName); err == nil && cookie.Value != "" {
		globalPendingMFASessions.delete(cookie.Value)
	}

	clearPendingMFACookie(ctx)
}
