package api

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// RuntimeHandler handles runtime settings requests
type RuntimeHandler struct {
	MongoDB *db.MongoDB
}

// NewRuntimeHandler creates a new RuntimeHandler
func NewRuntimeHandler(mongoDB *db.MongoDB) *RuntimeHandler {
	return &RuntimeHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the runtime settings routes
func (h *RuntimeHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/runtime/:userId/:profileName", h.GetRuntimeSettings)
	router.POST("/api/runtime/:userId/:profileName", h.SaveRuntimeSettings)
	router.DELETE("/api/runtime/:userId/:profileName", h.DeleteRuntimeSettings)
}

// GetRuntimeSettings handles the GET /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) GetRuntimeSettings(ctx *gin.Context) {
	// If MongoDB is not connected, return empty runtime settings
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
			Connection: map[string]interface{}{},
			Hooks:      map[string]interface{}{},
		})

		return
	}

	userID := ctx.Param("userId")
	profileName := ctx.Param("profileName")
	var runtimeSettings models.RuntimeSettings

	err := h.MongoDB.RuntimeColl.FindOne(
		context.Background(),
		bson.M{"userId": userID, "profileName": profileName},
	).Decode(&runtimeSettings)

	if err != nil {
		// If no runtime settings found, return empty settings
		ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
			Connection: map[string]interface{}{},
			Hooks:      map[string]interface{}{},
		})

		return
	}

	ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
		Connection: runtimeSettings.Connection,
		Hooks:      runtimeSettings.Hooks,
	})
}

// SaveRuntimeSettings handles the POST /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) SaveRuntimeSettings(ctx *gin.Context) {
	// If MongoDB is not connected, return success but log warning
	if !h.MongoDB.IsConnected {
		var runtimeResponse models.RuntimeSettingsResponse
		if err := ctx.ShouldBindJSON(&runtimeResponse); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

			return
		}

		ctx.JSON(http.StatusOK, runtimeResponse)

		return
	}

	userID := ctx.Param("userId")
	profileName := ctx.Param("profileName")
	var runtimeResponse models.RuntimeSettingsResponse
	if err := ctx.ShouldBindJSON(&runtimeResponse); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Update or create runtime settings
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	filter := bson.M{"userId": userID, "profileName": profileName}
	update := bson.M{
		"$set": bson.M{
			"userId":      userID,
			"profileName": profileName,
			"connection":  runtimeResponse.Connection,
			"hooks":       runtimeResponse.Hooks,
		},
	}

	var runtimeSettings models.RuntimeSettings
	err := h.MongoDB.RuntimeColl.FindOneAndUpdate(
		context.Background(),
		filter,
		update,
		opts,
	).Decode(&runtimeSettings)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save runtime settings"})

		return
	}

	ctx.JSON(http.StatusOK, models.RuntimeSettingsResponse{
		Connection: runtimeSettings.Connection,
		Hooks:      runtimeSettings.Hooks,
	})
}

// DeleteRuntimeSettings handles the DELETE /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) DeleteRuntimeSettings(ctx *gin.Context) {
	// If MongoDB is not connected, return success
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Runtime settings deleted successfully"})
		return
	}

	userID := ctx.Param("userId")
	profileName := ctx.Param("profileName")

	// Delete runtime settings
	filter := bson.M{"userId": userID, "profileName": profileName}
	result, err := h.MongoDB.RuntimeColl.DeleteOne(context.Background(), filter)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete runtime settings"})
		return
	}

	if result.DeletedCount == 0 {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Runtime settings not found"})
		return
	}

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Runtime settings deleted successfully"})
}
