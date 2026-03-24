package api

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/requestmeta"
)

const (
	accessCookieName  = "nauthilus_ui_session"
	refreshCookieName = "nauthilus_ui_refresh_session"
	csrfCookieName    = "nauthilus_ui_csrf_token"
)

// RotateCSRFCookie creates a fresh readable CSRF cookie used for double-submit protection.
func RotateCSRFCookie(ctx *gin.Context) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	token := base64.RawURLEncoding.EncodeToString(raw)
	setCSRFCookie(ctx, token)

	return token, nil
}

// EnsureCSRFCookie makes sure a CSRF cookie exists and returns its value.
func EnsureCSRFCookie(ctx *gin.Context) (string, error) {
	if cookie, err := ctx.Request.Cookie(csrfCookieName); err == nil && cookie.Value != "" {
		return cookie.Value, nil
	}

	return RotateCSRFCookie(ctx)
}

func setCSRFCookie(ctx *gin.Context, token string) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     csrfCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: false,
		Secure:   requestmeta.IsSecureRequest(ctx.Request),
		SameSite: http.SameSiteStrictMode,
	})
}

func clearCSRFCookie(ctx *gin.Context) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     csrfCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   requestmeta.IsSecureRequest(ctx.Request),
		SameSite: http.SameSiteStrictMode,
	})
}

func setSessionCookie(ctx *gin.Context, name string, value string, expiresAt time.Time, httpOnly bool, persistent bool) {
	secure := requestmeta.IsSecureRequest(ctx.Request)
	cookie := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: httpOnly,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	}

	if persistent {
		cookie.Expires = expiresAt
		cookie.MaxAge = max(int(time.Until(expiresAt).Seconds()), 0)
	}

	http.SetCookie(ctx.Writer, cookie)
}

func clearCookie(ctx *gin.Context, name string, httpOnly bool) {
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: httpOnly,
		Secure:   requestmeta.IsSecureRequest(ctx.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

// SetAuthCookies sets secure HttpOnly cookies for opaque access and refresh sessions.
func SetAuthCookies(ctx *gin.Context, accessToken string, accessExpiresAt time.Time, refreshToken string, refreshExpiresAt time.Time, persistent bool) error {
	if _, err := RotateCSRFCookie(ctx); err != nil {
		return err
	}

	setSessionCookie(ctx, accessCookieName, accessToken, accessExpiresAt, true, persistent)
	setSessionCookie(ctx, refreshCookieName, refreshToken, refreshExpiresAt, true, persistent)

	return nil
}

// ClearAuthCookies removes the auth cookies on the client.
func ClearAuthCookies(ctx *gin.Context) {
	clearCookie(ctx, accessCookieName, true)
	clearCookie(ctx, refreshCookieName, true)
	clearCSRFCookie(ctx)
}
