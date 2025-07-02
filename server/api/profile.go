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

// ProfileHandler handles profile requests
type ProfileHandler struct {
	MongoDB *db.MongoDB
}

// NewProfileHandler creates a new ProfileHandler
func NewProfileHandler(mongoDB *db.MongoDB) *ProfileHandler {
	return &ProfileHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the profile routes
func (h *ProfileHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/profiles/:userId", h.GetProfiles)
	router.POST("/api/profiles/:userId", h.SaveProfiles)
}

// GetProfiles handles the GET /api/profiles/:userId endpoint
func (h *ProfileHandler) GetProfiles(c *gin.Context) {
	// If MongoDB is not connected, return default profile
	if !h.MongoDB.IsConnected {
		c.JSON(http.StatusOK, models.ProfileResponse{
			Profiles: []models.ProfileData{
				{
					Name: "Default",
					Config: map[string]interface{}{
						"server": map[string]interface{}{
							"address":                      "127.0.0.1:8080",
							"instance_name":                "nauthilus",
							"max_concurrent_requests":      100,
							"max_password_history_entries": 10,
							"redis": map[string]interface{}{
								"database_number": 0,
								"prefix":          "nt:",
								"master": map[string]interface{}{
									"address": "127.0.0.1:6379",
								},
							},
						},
						"connection": map[string]interface{}{
							"backend_url": "http://127.0.0.1:8080",
							"basic_auth": map[string]interface{}{
								"enabled":  false,
								"username": "",
								"password": "",
							},
							"jwt_auth": map[string]interface{}{
								"enabled": false,
								"token":   "",
							},
						},
					},
				},
			},
			CurrentProfileName: "Default",
		})

		return
	}

	userID := c.Param("userId")
	var profile models.Profile

	err := h.MongoDB.ProfileColl.FindOne(context.Background(), bson.M{"userId": userID}).Decode(&profile)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profiles not found"})

		return
	}

	c.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}

// SaveProfiles handles the POST /api/profiles/:userId endpoint
func (h *ProfileHandler) SaveProfiles(c *gin.Context) {
	// If MongoDB is not connected, return success but log warning
	if !h.MongoDB.IsConnected {
		var profileResponse models.ProfileResponse
		if err := c.ShouldBindJSON(&profileResponse); err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
			return
		}

		c.JSON(http.StatusOK, profileResponse)

		return
	}

	userID := c.Param("userId")
	var profileResponse models.ProfileResponse
	if err := c.ShouldBindJSON(&profileResponse); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Update or create profile data
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	filter := bson.M{"userId": userID}
	update := bson.M{
		"$set": bson.M{
			"userId":             userID,
			"profiles":           profileResponse.Profiles,
			"currentProfileName": profileResponse.CurrentProfileName,
		},
	}

	var profile models.Profile
	err := h.MongoDB.ProfileColl.FindOneAndUpdate(
		context.Background(),
		filter,
		update,
		opts,
	).Decode(&profile)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save profiles"})

		return
	}

	c.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}
