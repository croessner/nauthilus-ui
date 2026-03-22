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
	accessCookieName  = "nauthilus_token"
	refreshCookieName = "nauthilus_refresh_token"
	csrfCookieName    = "nauthilus_csrf_token"
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

// SetAuthCookies sets secure HttpOnly cookies for access and refresh tokens.
func SetAuthCookies(ctx *gin.Context, accessToken string, accessExpiresAt int64, refreshToken string, refreshExpiresAt int64) error {
	secure := requestmeta.IsSecureRequest(ctx.Request)

	if _, err := RotateCSRFCookie(ctx); err != nil {
		return err
	}

	// Access token cookie
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     accessCookieName,
		Value:    accessToken,
		Path:     "/",
		Expires:  time.Unix(accessExpiresAt, 0),
		MaxAge:   int(time.Until(time.Unix(accessExpiresAt, 0)).Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	// Refresh token cookie
	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     refreshCookieName,
		Value:    refreshToken,
		Path:     "/",
		Expires:  time.Unix(refreshExpiresAt, 0),
		MaxAge:   int(time.Until(time.Unix(refreshExpiresAt, 0)).Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	return nil
}

// ClearAuthCookies removes the auth cookies on the client.
func ClearAuthCookies(ctx *gin.Context) {
	secure := requestmeta.IsSecureRequest(ctx.Request)
	expired := time.Unix(0, 0)

	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     accessCookieName,
		Value:    "",
		Path:     "/",
		Expires:  expired,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(ctx.Writer, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/",
		Expires:  expired,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	clearCSRFCookie(ctx)
}
