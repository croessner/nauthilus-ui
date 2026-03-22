package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// JWTConfigHandler handles JWT configuration requests
type JWTConfigHandler struct {
	MongoDB *db.MongoDB
}

// NewJWTConfigHandler creates a new JWTConfigHandler
func NewJWTConfigHandler(mongoDB *db.MongoDB) *JWTConfigHandler {
	return &JWTConfigHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the JWT configuration routes
func (h *JWTConfigHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/jwtconfig", RequireAdmin(), h.GetJWTConfig)
	router.PUT("/api/jwtconfig", RequireAdmin(), h.UpdateJWTConfig)
}

// GetJWTConfig handles the GET /api/jwtconfig endpoint
func (h *JWTConfigHandler) GetJWTConfig(ctx *gin.Context) {
	// If MongoDB is not connected, return default JWT config
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.JWTConfigResponse{
			JWTConfig: models.ToJWTConfigView(models.JWTConfig{
				JWTSecret:          h.MongoDB.Config.JWTSecret,
				TokenExpiry:        h.MongoDB.Config.TokenExpiry,
				RefreshTokenExpiry: h.MongoDB.Config.RefreshTokenExpiry,
				RememberMeExpiry:   h.MongoDB.Config.RememberMeExpiry,
			}),
		})

		return
	}

	// Get JWT config
	var jwtConfig models.JWTConfig
	err := h.MongoDB.JWTConfigColl.FindOne(context.Background(), bson.M{}).Decode(&jwtConfig)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "JWT configuration not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch JWT configuration"})
		}

		return
	}

	ctx.JSON(http.StatusOK, models.JWTConfigResponse{JWTConfig: models.ToJWTConfigView(jwtConfig)})
}

// UpdateJWTConfig handles the PUT /api/jwtconfig endpoint
func (h *JWTConfigHandler) UpdateJWTConfig(ctx *gin.Context) {
	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	var jwtConfigRequest models.JWTConfigUpdateRequest
	if err := ctx.ShouldBindJSON(&jwtConfigRequest); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Find JWT config
	var jwtConfig models.JWTConfig
	err := h.MongoDB.JWTConfigColl.FindOne(context.Background(), bson.M{}).Decode(&jwtConfig)

	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch JWT configuration"})

		return
	}

	// Create new JWT config if none exists
	if errors.Is(err, mongo.ErrNoDocuments) {
		newJWTConfig := models.JWTConfig{
			JWTSecret:          h.MongoDB.Config.JWTSecret,
			TokenExpiry:        h.MongoDB.Config.TokenExpiry,
			RefreshTokenExpiry: h.MongoDB.Config.RefreshTokenExpiry,
			RememberMeExpiry:   h.MongoDB.Config.RememberMeExpiry,
		}

		if jwtConfigRequest.JWTSecret != nil && *jwtConfigRequest.JWTSecret != "" {
			newJWTConfig.JWTSecret = *jwtConfigRequest.JWTSecret
		}
		if jwtConfigRequest.TokenExpiry != nil && *jwtConfigRequest.TokenExpiry > 0 {
			newJWTConfig.TokenExpiry = *jwtConfigRequest.TokenExpiry
		}
		if jwtConfigRequest.RefreshTokenExpiry != nil && *jwtConfigRequest.RefreshTokenExpiry > 0 {
			newJWTConfig.RefreshTokenExpiry = *jwtConfigRequest.RefreshTokenExpiry
		}
		if jwtConfigRequest.RememberMeExpiry != nil && *jwtConfigRequest.RememberMeExpiry > 0 {
			newJWTConfig.RememberMeExpiry = *jwtConfigRequest.RememberMeExpiry
		}

		_, err = h.MongoDB.JWTConfigColl.InsertOne(context.Background(), newJWTConfig)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create JWT configuration"})

			return
		}

		// Audit JWT configuration creation
		WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
			Action: "jwt.update",
			Details: map[string]interface{}{
				"tokenExpiry":        newJWTConfig.TokenExpiry,
				"refreshTokenExpiry": newJWTConfig.RefreshTokenExpiry,
				"rememberMeExpiry":   newJWTConfig.RememberMeExpiry,
			},
		})

		ctx.JSON(http.StatusOK, models.JWTConfigResponse{JWTConfig: models.ToJWTConfigView(newJWTConfig)})

		return
	}

	// Update existing JWT config
	update := bson.M{}
	if jwtConfigRequest.JWTSecret != nil && *jwtConfigRequest.JWTSecret != "" {
		update["jwtSecret"] = *jwtConfigRequest.JWTSecret
	}
	if jwtConfigRequest.TokenExpiry != nil && *jwtConfigRequest.TokenExpiry > 0 {
		update["tokenExpiry"] = *jwtConfigRequest.TokenExpiry
	}
	if jwtConfigRequest.RefreshTokenExpiry != nil && *jwtConfigRequest.RefreshTokenExpiry > 0 {
		update["refreshTokenExpiry"] = *jwtConfigRequest.RefreshTokenExpiry
	}
	if jwtConfigRequest.RememberMeExpiry != nil && *jwtConfigRequest.RememberMeExpiry > 0 {
		update["rememberMeExpiry"] = *jwtConfigRequest.RememberMeExpiry
	}

	if len(update) == 0 {
		ctx.JSON(http.StatusOK, models.JWTConfigResponse{JWTConfig: models.ToJWTConfigView(jwtConfig)})
		return
	}

	// Update JWT config
	_, err = h.MongoDB.JWTConfigColl.UpdateOne(
		context.Background(),
		bson.M{},
		bson.M{"$set": update},
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update JWT configuration"})

		return
	}

	// Get updated JWT config
	var updatedJWTConfig models.JWTConfig
	err = h.MongoDB.JWTConfigColl.FindOne(context.Background(), bson.M{}).Decode(&updatedJWTConfig)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch updated JWT configuration"})

		return
	}

	// Audit JWT configuration update (do not log secrets)
	var changed []string

	for k := range update {
		changed = append(changed, k)
	}

	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Action:  "jwt.update",
		Details: map[string]interface{}{"changed": changed},
	})

	ctx.JSON(http.StatusOK, models.JWTConfigResponse{JWTConfig: models.ToJWTConfigView(updatedJWTConfig)})
}
