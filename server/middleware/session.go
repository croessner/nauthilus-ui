package middleware

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/api"
	"nauthilus-ui/server/db"
	"nauthilus-ui/server/utils"
)

const SessionAuthRequiredHeader = "X-Nauthilus-Auth-Required"

// SessionAuthMiddleware validates protected requests using opaque access
// sessions from HttpOnly cookies.
func SessionAuthMiddleware(mongoDB *db.MongoDB) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		path := ctx.Request.URL.Path

		slog.Info("Session Middleware: Processing request", "path", path, "method", ctx.Request.Method)

		if IsPublicPath(path) {
			slog.Info("Session Middleware: Skipping auth for public endpoint", "path", path)
			ctx.Next()
			return
		}

		if strings.HasPrefix(path, "/static/") || path == "/" || strings.HasPrefix(path, "/env-config.js") {
			slog.Info("Session Middleware: Skipping auth for static file", "path", path)
			ctx.Next()
			return
		}

		if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/proxy/") {
			slog.Info("Session Middleware: Skipping auth for non-API, non-proxy endpoint", "path", path)
			ctx.Next()
			return
		}

		slog.Info("Session Middleware: Enforcing authentication for protected endpoint", "path", path)
		slog.Info("Session Middleware: Request headers", "headers", utils.RedactHeaders(ctx.Request.Header))

		username, roles, err := api.OptionalRequestAuth(ctx, mongoDB)
		if err != nil {
			if api.IsNoRequestAuth(err) {
				slog.Warn("Session Middleware: Missing or invalid session")
				ctx.Header(SessionAuthRequiredHeader, "1")
				ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
				ctx.Abort()
				return
			}

			slog.Error("Session Middleware: Session validation failed", "error", err)
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			ctx.Abort()
			return
		}

		ctx.Set("username", username)
		ctx.Set("roles", roles)
		ctx.Next()
	}
}
