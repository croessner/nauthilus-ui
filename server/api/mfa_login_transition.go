package api

import (
	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
)

// startPendingMFALogin clears any existing authenticated browser session before
// issuing a fresh pending MFA challenge. This prevents a stale authenticated
// cookie from remaining usable while a second-factor challenge is in progress.
func startPendingMFALogin(ctx *gin.Context, mongoDB *db.MongoDB, username string, rememberMe bool) error {
	if mongoDB != nil {
		if accessToken := readAccessTokenFromRequest(ctx.Request); accessToken != "" {
			_ = deleteOpaqueSession(ctx.Request.Context(), mongoDB, accessToken, sessionKindAccess)
		}

		if cookie, err := ctx.Request.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
			_ = deleteOpaqueSession(ctx.Request.Context(), mongoDB, cookie.Value, sessionKindRefresh)
		}
	}

	ClearAuthCookies(ctx)
	clearPendingMFASession(ctx)

	return createPendingMFASession(ctx, username, rememberMe)
}
