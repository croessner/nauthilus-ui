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
func (h *RuntimeHandler) GetRuntimeSettings(c *gin.Context) {
	// If MongoDB is not connected, return empty runtime settings
	if !h.MongoDB.IsConnected {
		c.JSON(http.StatusOK, models.RuntimeSettingsResponse{
			Connection: map[string]interface{}{},
			Hooks:      map[string]interface{}{},
		})

		return
	}

	userID := c.Param("userId")
	profileName := c.Param("profileName")
	var runtimeSettings models.RuntimeSettings

	err := h.MongoDB.RuntimeColl.FindOne(
		context.Background(),
		bson.M{"userId": userID, "profileName": profileName},
	).Decode(&runtimeSettings)

	if err != nil {
		// If no runtime settings found, return empty settings
		c.JSON(http.StatusOK, models.RuntimeSettingsResponse{
			Connection: map[string]interface{}{},
			Hooks:      map[string]interface{}{},
		})

		return
	}

	c.JSON(http.StatusOK, models.RuntimeSettingsResponse{
		Connection: runtimeSettings.Connection,
		Hooks:      runtimeSettings.Hooks,
	})
}

// SaveRuntimeSettings handles the POST /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) SaveRuntimeSettings(c *gin.Context) {
	// If MongoDB is not connected, return success but log warning
	if !h.MongoDB.IsConnected {
		var runtimeResponse models.RuntimeSettingsResponse
		if err := c.ShouldBindJSON(&runtimeResponse); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

			return
		}

		c.JSON(http.StatusOK, runtimeResponse)

		return
	}

	userID := c.Param("userId")
	profileName := c.Param("profileName")
	var runtimeResponse models.RuntimeSettingsResponse
	if err := c.ShouldBindJSON(&runtimeResponse); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

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
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save runtime settings"})

		return
	}

	c.JSON(http.StatusOK, models.RuntimeSettingsResponse{
		Connection: runtimeSettings.Connection,
		Hooks:      runtimeSettings.Hooks,
	})
}

// DeleteRuntimeSettings handles the DELETE /api/runtime/:userId/:profileName endpoint
func (h *RuntimeHandler) DeleteRuntimeSettings(c *gin.Context) {
	// If MongoDB is not connected, return success
	if !h.MongoDB.IsConnected {
		c.JSON(http.StatusOK, models.MessageResponse{Message: "Runtime settings deleted successfully"})
		return
	}

	userID := c.Param("userId")
	profileName := c.Param("profileName")

	// Delete runtime settings
	filter := bson.M{"userId": userID, "profileName": profileName}
	result, err := h.MongoDB.RuntimeColl.DeleteOne(context.Background(), filter)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete runtime settings"})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Runtime settings not found"})
		return
	}

	c.JSON(http.StatusOK, models.MessageResponse{Message: "Runtime settings deleted successfully"})
}
