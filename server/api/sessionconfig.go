package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// SessionConfigHandler handles session configuration requests.
type SessionConfigHandler struct {
	MongoDB *db.MongoDB
}

// NewSessionConfigHandler creates a new SessionConfigHandler.
func NewSessionConfigHandler(mongoDB *db.MongoDB) *SessionConfigHandler {
	return &SessionConfigHandler{MongoDB: mongoDB}
}

// RegisterRoutes registers the session configuration routes.
func (h *SessionConfigHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/sessionconfig", RequireAdmin(), h.GetSessionConfig)
	router.PUT("/api/sessionconfig", RequireAdmin(), h.UpdateSessionConfig)
}

// GetSessionConfig handles GET /api/sessionconfig.
func (h *SessionConfigHandler) GetSessionConfig(ctx *gin.Context) {
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.SessionConfigResponse{
			SessionConfig: models.ToSessionConfigView(models.SessionConfig{
				TokenExpiry:        h.MongoDB.Config.Session.TokenExpirySeconds,
				RefreshTokenExpiry: h.MongoDB.Config.Session.RefreshTokenExpirySeconds,
				RememberMeExpiry:   h.MongoDB.Config.Session.RememberMeExpirySeconds,
			}),
		})

		return
	}

	sessionConfig, err := h.MongoDB.GetSessionConfig()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch session configuration"})
		return
	}

	ctx.JSON(http.StatusOK, models.SessionConfigResponse{SessionConfig: models.ToSessionConfigView(*sessionConfig)})
}

// UpdateSessionConfig handles PUT /api/sessionconfig.
func (h *SessionConfigHandler) UpdateSessionConfig(ctx *gin.Context) {
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})
		return
	}

	var sessionConfigRequest models.SessionConfigUpdateRequest
	if err := ctx.ShouldBindJSON(&sessionConfigRequest); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	currentConfig, err := h.MongoDB.GetSessionConfig()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch session configuration"})
		return
	}

	updatedConfig := *currentConfig
	changed := make([]string, 0, 3)

	if sessionConfigRequest.TokenExpiry != nil && *sessionConfigRequest.TokenExpiry > 0 && updatedConfig.TokenExpiry != *sessionConfigRequest.TokenExpiry {
		updatedConfig.TokenExpiry = *sessionConfigRequest.TokenExpiry
		changed = append(changed, "tokenExpiry")
	}
	if sessionConfigRequest.RefreshTokenExpiry != nil && *sessionConfigRequest.RefreshTokenExpiry > 0 && updatedConfig.RefreshTokenExpiry != *sessionConfigRequest.RefreshTokenExpiry {
		updatedConfig.RefreshTokenExpiry = *sessionConfigRequest.RefreshTokenExpiry
		changed = append(changed, "refreshTokenExpiry")
	}
	if sessionConfigRequest.RememberMeExpiry != nil && *sessionConfigRequest.RememberMeExpiry > 0 && updatedConfig.RememberMeExpiry != *sessionConfigRequest.RememberMeExpiry {
		updatedConfig.RememberMeExpiry = *sessionConfigRequest.RememberMeExpiry
		changed = append(changed, "rememberMeExpiry")
	}

	if len(changed) == 0 {
		ctx.JSON(http.StatusOK, models.SessionConfigResponse{SessionConfig: models.ToSessionConfigView(updatedConfig)})
		return
	}

	if err := h.MongoDB.UpdateSessionConfig(&updatedConfig); err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update session configuration"})
		return
	}

	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action:  "session.update",
		Details: map[string]interface{}{"changed": changed},
	})

	ctx.JSON(http.StatusOK, models.SessionConfigResponse{SessionConfig: models.ToSessionConfigView(updatedConfig)})
}
