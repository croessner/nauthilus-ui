package middleware

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/utils"
)

// JWTAuthMiddleware creates a middleware for JWT authentication
// It verifies the JWT token signature using the secret from the database
func JWTAuthMiddleware(mongoDB *db.MongoDB) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Skip authentication for excluded paths
		path := ctx.Request.URL.Path
		method := ctx.Request.Method

		// Log the request path for debugging
		slog.Info("JWT Middleware: Processing request", "path", path, "method", method)

		if IsPublicPath(path) {
			slog.Info("JWT Middleware: Skipping auth for public endpoint", "path", path)
			ctx.Next()

			return
		}

		// Skip authentication for static files
		if strings.HasPrefix(path, "/static/") || path == "/" || strings.HasPrefix(path, "/env-config.js") {
			slog.Info("JWT Middleware: Skipping auth for static file", "path", path)
			ctx.Next()

			return
		}

		// Enforce authentication for API and Proxy endpoints; allow skip only for other non-API routes (e.g., static)
		if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/proxy/") {
			slog.Info("JWT Middleware: Skipping auth for non-API, non-proxy endpoint", "path", path)
			ctx.Next()

			return
		}

		// Enforce authentication for protected endpoints (API or Proxy)
		slog.Info("JWT Middleware: Enforcing authentication for protected endpoint", "path", path)

		// For debugging: log all headers
		slog.Info("JWT Middleware: Request headers", "headers", utils.RedactHeaders(ctx.Request.Header))

		// Try to get token from Authorization header first
		authHeader := ctx.GetHeader("Authorization")
		slog.Info("JWT Middleware: Authorization header", "header", utils.RedactHeaderValue("Authorization", authHeader))

		var tokenString string
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			} else {
				slog.Warn("JWT Middleware: Invalid Authorization header format", "header", utils.RedactHeaderValue("Authorization", authHeader))
			}
		}

		// Fallback to HttpOnly cookie if no valid Authorization header
		if tokenString == "" {
			if c, err := ctx.Request.Cookie("nauthilus_token"); err == nil {
				tokenString = c.Value
			}
		}

		if tokenString == "" || tokenString == "null" {
			slog.Warn("JWT Middleware: Missing token in header and cookie")
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			ctx.Abort()

			return
		}

		// Get JWT config to access the secret
		jwtConfig, err := mongoDB.GetJWTConfig()
		if err != nil {
			slog.Error("JWT Middleware: Failed to get JWT config", "error", err)
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			ctx.Abort()

			return
		}

		// Parse and verify the JWT token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Validate the signing algorithm
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}

			// Return the secret key used for signing
			return []byte(jwtConfig.Secret), nil
		})

		if err != nil {
			slog.Warn("JWT Middleware: Invalid token", "error", err)
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token: " + err.Error()})
			ctx.Abort()

			return
		}

		// Verify token is valid
		if !token.Valid {
			slog.Warn("JWT Middleware: Token is invalid")
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			ctx.Abort()

			return
		}

		// Extract claims from the token
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			slog.Warn("JWT Middleware: Failed to extract claims")
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			ctx.Abort()

			return
		}

		// Check token expiration
		exp, ok := claims["exp"]
		if !ok {
			slog.Warn("JWT Middleware: Token missing expiration")
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Token missing expiration"})
			ctx.Abort()

			return
		}

		// Convert exp to int64
		var expTime int64
		switch v := exp.(type) {
		case float64:
			expTime = int64(v)
		case json.Number:
			expTime, _ = v.Int64()
		default:
			slog.Warn("JWT Middleware: Invalid expiration format")
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token expiration format"})
			ctx.Abort()

			return
		}

		if time.Now().Unix() > expTime {
			slog.Warn("JWT Middleware: Token has expired")
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Token has expired"})
			ctx.Abort()

			return
		}

		slog.Info("JWT Middleware: Token validation successful", "username", claims["sub"])

		// Store user information in the context
		username, ok := claims["sub"].(string)
		if !ok {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Token missing subject claim"})
			ctx.Abort()

			return
		}

		// Set user information in the context
		ctx.Set("username", username)

		// Extract roles if available (handle multiple possible JSON types)
		if rolesInterface, ok := claims["roles"]; ok {
			// Case 1: roles came in as []interface{} (common when decoding JSON arrays)
			if roles, ok := rolesInterface.([]interface{}); ok {
				roleStrings := make([]string, 0, len(roles))
				for _, role := range roles {
					if roleStr, ok := role.(string); ok {
						roleStrings = append(roleStrings, roleStr)
					}
				}

				ctx.Set("roles", roleStrings)
			} else if rolesStrSlice, ok := rolesInterface.([]string); ok {
				// Case 2: roles already decoded as []string
				ctx.Set("roles", rolesStrSlice)
			} else if singleRole, ok := rolesInterface.(string); ok {
				// Case 3: a single role as string (non-standard but be lenient)
				ctx.Set("roles", []string{singleRole})
			}
		}

		ctx.Next()
	}
}
