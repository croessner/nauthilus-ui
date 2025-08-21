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
func (h *ProfileHandler) GetProfiles(ctx *gin.Context) {
	// If MongoDB is not connected, return default profile
	if !h.MongoDB.IsConnected {
		ctx.JSON(http.StatusOK, models.ProfileResponse{
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

	userID := ctx.Param("userId")
	var profile models.Profile

	err := h.MongoDB.ProfileColl.FindOne(context.Background(), bson.M{"userId": userID}).Decode(&profile)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Profiles not found"})

		return
	}

	ctx.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}

// SaveProfiles handles the POST /api/profiles/:userId endpoint
func (h *ProfileHandler) SaveProfiles(ctx *gin.Context) {
	// If MongoDB is not connected, return success but log warning
	if !h.MongoDB.IsConnected {
		var profileResponse models.ProfileResponse
		if err := ctx.ShouldBindJSON(&profileResponse); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
			return
		}

		ctx.JSON(http.StatusOK, profileResponse)

		return
	}

	userID := ctx.Param("userId")
	var profileResponse models.ProfileResponse
	if err := ctx.ShouldBindJSON(&profileResponse); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

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
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save profiles"})

		return
	}

	// After profiles are saved, sync custom_hooks from the currently active profile into runtime collection
	currentProfileName := profileResponse.CurrentProfileName
	var activeConfig map[string]interface{}
	for _, p := range profile.Profiles {
		if p.Name == currentProfileName {
			activeConfig = p.Config
			break
		}
	}

	if activeConfig != nil {
		// Try to extract lua.custom_hooks from the active config (if present)
		var customHooks []interface{}
		if luaSection, ok := activeConfig["lua"].(map[string]interface{}); ok {
			if ch, ok := luaSection["custom_hooks"].([]interface{}); ok {
				customHooks = ch
			}
		}

		// Upsert runtime document for user+profile to set hooks.custom_hooks while preserving existing connection
		runtimeFilter := bson.M{"userId": userID, "profileName": currentProfileName}
		// Read existing connection if present
		type runtimeDoc struct {
			Connection map[string]interface{} `bson:"connection"`
			Hooks      map[string]interface{} `bson:"hooks"`
		}

		var existing runtimeDoc
		h.MongoDB.RuntimeColl.FindOne(context.Background(), runtimeFilter).Decode(&existing)

		newHooks := bson.M{}
		// start from existing hooks map if any
		if existing.Hooks != nil {
			for k, v := range existing.Hooks {
				newHooks[k] = v
			}
		}

		// set/overwrite custom_hooks only if we have them; otherwise keep as-is
		if customHooks != nil {
			newHooks["custom_hooks"] = customHooks
		}

		runtimeUpdate := bson.M{
			"$set": bson.M{
				"userId":      userID,
				"profileName": currentProfileName,
				"connection":  existing.Connection, // preserve
				"hooks":       newHooks,
			},
		}
		_, _ = h.MongoDB.RuntimeColl.UpdateOne(context.Background(), runtimeFilter, runtimeUpdate, options.Update().SetUpsert(true))
	}

	ctx.JSON(http.StatusOK, models.ProfileResponse{
		Profiles:           profile.Profiles,
		CurrentProfileName: profile.CurrentProfileName,
	})
}
