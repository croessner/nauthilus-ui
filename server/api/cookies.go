package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	accessCookieName  = "nauthilus_token"
	refreshCookieName = "nauthilus_refresh_token"
)

// SetAuthCookies sets secure HttpOnly cookies for access and refresh tokens
func SetAuthCookies(ctx *gin.Context, accessToken string, accessExpiresAt int64, refreshToken string, refreshExpiresAt int64) {
	secure := ctx.Request.TLS != nil || ctx.Request.Header.Get("X-Forwarded-Proto") == "https"

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
}

// ClearAuthCookies removes the auth cookies on the client
func ClearAuthCookies(ctx *gin.Context) {
	secure := ctx.Request.TLS != nil || ctx.Request.Header.Get("X-Forwarded-Proto") == "https"
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
}
