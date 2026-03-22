package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/models"
)

// CurrentUsername extracts the authenticated username from the request context.
func CurrentUsername(ctx *gin.Context) string {
	usernameAny, _ := ctx.Get("username")
	username, _ := usernameAny.(string)

	return username
}

// CurrentRoles extracts the authenticated roles from the request context.
func CurrentRoles(ctx *gin.Context) []string {
	rolesAny, _ := ctx.Get("roles")
	roles, _ := rolesAny.([]string)

	return roles
}

// HasRole checks if the target role exists in the given role list.
func HasRole(roles []string, role string) bool {
	for _, currentRole := range roles {
		if currentRole == role {
			return true
		}
	}

	return false
}

// IsAdminContext reports whether the current request belongs to an admin user.
func IsAdminContext(ctx *gin.Context) bool {
	return HasRole(CurrentRoles(ctx), "admin")
}

// RequireAdmin ensures that only admin users can access the wrapped route.
func RequireAdmin() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if CurrentUsername(ctx) == "" {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Authentication required"})

			return
		}

		if !IsAdminContext(ctx) {
			ctx.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{Error: "Admin role required"})

			return
		}

		ctx.Next()
	}
}

// RequireSelfOrAdmin ensures that the current user matches the named route parameter or is an admin.
func RequireSelfOrAdmin(paramName string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username := CurrentUsername(ctx)
		if username == "" {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Authentication required"})

			return
		}

		if IsAdminContext(ctx) || ctx.Param(paramName) == username {
			ctx.Next()

			return
		}

		ctx.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{Error: "Access denied"})
	}
}
