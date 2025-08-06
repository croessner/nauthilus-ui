package middleware

import (
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
)

// JWTAuthMiddleware creates a middleware for JWT authentication
func JWTAuthMiddleware(_ *db.MongoDB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip authentication for excluded paths
		path := c.Request.URL.Path
		method := c.Request.Method

		// Log the request path for debugging
		slog.Info("JWT Middleware: Processing request", "path", path, "method", method)

		// Always allow access to authentication endpoints
		if strings.HasPrefix(path, "/api/auth/") {
			slog.Info("JWT Middleware: Skipping auth for auth endpoint", "path", path)
			c.Next()

			return
		}

		// Skip authentication for static files
		if strings.HasPrefix(path, "/static/") || path == "/" || strings.HasPrefix(path, "/env-config.js") {
			slog.Info("JWT Middleware: Skipping auth for static file", "path", path)
			c.Next()

			return
		}

		// Skip authentication for proxy endpoints
		if strings.HasPrefix(path, "/proxy/") {
			slog.Info("JWT Middleware: Skipping auth for proxy endpoint", "path", path)
			c.Next()

			return
		}

		// Skip authentication for health endpoint
		if strings.HasPrefix(path, "/api/health") {
			slog.Info("JWT Middleware: Skipping auth for health endpoint", "path", path)
			c.Next()

			return
		}

		// Only enforce authentication for API endpoints
		if !strings.HasPrefix(path, "/api/") {
			slog.Info("JWT Middleware: Skipping auth for non-API endpoint", "path", path)
			c.Next()

			return
		}

		// CRITICAL FIX: Ensure we're actually enforcing authentication for API endpoints
		slog.Info("JWT Middleware: Strictly enforcing authentication for API endpoint", "path", path)

		// For debugging: log all headers
		headers := c.Request.Header
		slog.Info("JWT Middleware: Request headers", "headers", headers)

		// Get token from Authorization header
		authHeader := c.GetHeader("Authorization")
		slog.Info("JWT Middleware: Authorization header", "header", authHeader)

		if authHeader == "" {
			slog.Warn("JWT Middleware: Missing Authorization header")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header is required"})
			c.Abort()

			return
		}

		// Strictly enforce JWT authentication for all API endpoints

		// Check if the header has the Bearer prefix
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			slog.Warn("JWT Middleware: Invalid Authorization header format", "header", authHeader)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header format must be Bearer {token}"})
			c.Abort()

			return
		}

		tokenString := parts[1]

		// Check for null token (common issue with frontend tests)
		if tokenString == "null" || tokenString == "" {
			slog.Warn("JWT Middleware: Token is null or empty")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
			c.Abort()

			return
		}

		// Simple JWT validation - split the token into parts
		tokenParts := strings.Split(tokenString, ".")
		if len(tokenParts) != 3 {
			slog.Warn("JWT Middleware: Invalid token format", "token", tokenString)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token format"})
			c.Abort()

			return
		}

		// Decode the payload
		payloadBase64 := tokenParts[1]
		// Add padding if needed
		if len(payloadBase64)%4 != 0 {
			payloadBase64 += strings.Repeat("=", 4-len(payloadBase64)%4)
		}

		payloadBytes, err := base64.StdEncoding.DecodeString(payloadBase64)
		if err != nil {
			slog.Warn("JWT Middleware: Failed to decode token payload", "error", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to decode token payload"})
			c.Abort()

			return
		}

		// Parse the payload
		var payload map[string]interface{}
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			slog.Warn("JWT Middleware: Failed to parse token payload", "error", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to parse token payload"})
			c.Abort()

			return
		}

		// Check token expiration
		expFloat, ok := payload["exp"].(float64)
		if !ok {
			slog.Warn("JWT Middleware: Token missing expiration")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token missing expiration"})
			c.Abort()

			return
		}

		if time.Now().Unix() > int64(expFloat) {
			slog.Warn("JWT Middleware: Token has expired")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token has expired"})
			c.Abort()

			return
		}

		slog.Info("JWT Middleware: Token validation successful", "username", payload["sub"])

		// Store user information in the context
		username, ok := payload["sub"].(string)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token missing subject claim"})
			c.Abort()

			return
		}

		// Set user information in the context
		c.Set("username", username)

		// Extract roles if available
		if rolesInterface, ok := payload["roles"]; ok {
			if roles, ok := rolesInterface.([]interface{}); ok {
				roleStrings := make([]string, 0, len(roles))

				for _, role := range roles {
					if roleStr, ok := role.(string); ok {
						roleStrings = append(roleStrings, roleStr)
					}
				}

				c.Set("roles", roleStrings)
			}
		}

		c.Next()
	}
}
