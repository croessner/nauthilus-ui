package api

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"nauthilus-ui/server/db"
)

var errNoRequestAuth = errors.New("request is not authenticated")

func extractTokenString(ctx *gin.Context, cookieName string) string {
	authHeader := ctx.GetHeader("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			return parts[1]
		}
	}

	if cookie, err := ctx.Request.Cookie(cookieName); err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}

func claimsToRoles(rolesClaim any) []string {
	switch value := rolesClaim.(type) {
	case []string:
		return value
	case []interface{}:
		roles := make([]string, 0, len(value))
		for _, currentRole := range value {
			if role, ok := currentRole.(string); ok {
				roles = append(roles, role)
			}
		}

		return roles
	case string:
		if value == "" {
			return nil
		}

		return []string{value}
	default:
		return nil
	}
}

// OptionalRequestAuth extracts the current user from a bearer token or auth
// cookie when present. It does not mutate the Gin context and returns
// errNoRequestAuth when the request is anonymous.
func OptionalRequestAuth(ctx *gin.Context, mongoDB *db.MongoDB) (string, []string, error) {
	tokenString := extractTokenString(ctx, accessCookieName)
	if tokenString == "" {
		return "", nil, errNoRequestAuth
	}

	jwtConfig, err := mongoDB.GetJWTConfig()
	if err != nil {
		return "", nil, err
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}

		return []byte(jwtConfig.Secret), nil
	})
	if err != nil || !token.Valid {
		return "", nil, errNoRequestAuth
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", nil, errNoRequestAuth
	}

	expClaim, ok := claims["exp"]
	if !ok {
		return "", nil, errNoRequestAuth
	}

	var expiresAt int64
	switch value := expClaim.(type) {
	case float64:
		expiresAt = int64(value)
	case json.Number:
		expiresAt, _ = value.Int64()
	default:
		return "", nil, errNoRequestAuth
	}

	if expiresAt == 0 || time.Now().Unix() > expiresAt {
		return "", nil, errNoRequestAuth
	}

	username, ok := claims["sub"].(string)
	if !ok || username == "" {
		return "", nil, errNoRequestAuth
	}

	return username, claimsToRoles(claims["roles"]), nil
}
