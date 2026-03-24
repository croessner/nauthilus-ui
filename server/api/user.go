package api

import (
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// UserHandler handles user requests
type UserHandler struct {
	MongoDB db.UserDatabase
}

// NewUserHandler creates a new UserHandler
func NewUserHandler(mongoDB db.UserDatabase) *UserHandler {
	return &UserHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the user management routes with centralized authorization guards.
func (h *UserHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/api/users", RequireAdmin(), h.GetUsers)
	router.GET("/api/users/:username", RequireSelfOrAdmin("username"), h.GetUser)
	router.POST("/api/users", RequireAdmin(), h.CreateUser)
	router.PUT("/api/users/:username", RequireSelfOrAdmin("username"), h.UpdateUser)
	router.DELETE("/api/users/:username", RequireSelfOrAdmin("username"), h.DeleteUser)
}

// GetUsers handles the GET /api/users endpoint
func (h *UserHandler) GetUsers(ctx *gin.Context) {
	// If MongoDB is not connected, return default users
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusOK, models.UsersResponse{
			Users: []models.UserView{
				{
					Username:     "admin",
					Roles:        []string{"admin"},
					Enabled:      true,
					LastLogin:    nil,
					LastModified: time.Now().Format(time.RFC3339),
				},
			},
		})

		return
	}

	// Get all users without secret fields.
	cursor, err := h.MongoDB.GetUserCollection().Find(
		ctx.Request.Context(),
		bson.M{},
		options.Find().SetProjection(bson.M{"passwordHash": 0, "totpSecret": 0}),
	)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch users"})

		return
	}

	defer cursor.Close(ctx.Request.Context())

	// Use an intermediate type to detect if 'enabled' is missing (nil)
	type dbUser struct {
		Username        string                      `bson:"username" json:"username"`
		Roles           []string                    `bson:"roles" json:"roles"`
		DisplayName     string                      `bson:"displayName,omitempty" json:"displayName,omitempty"`
		Email           string                      `bson:"email,omitempty" json:"email,omitempty"`
		Avatar          string                      `bson:"avatar,omitempty" json:"avatar,omitempty"`
		Enabled         *bool                       `bson:"enabled" json:"enabled"`
		LastLogin       *string                     `bson:"lastLogin" json:"lastLogin"`
		LastModified    string                      `bson:"lastModified" json:"lastModified"`
		TOTPEnabled     bool                        `bson:"totpEnabled" json:"totpEnabled"`
		WebAuthnEnabled bool                        `bson:"webAuthnEnabled" json:"webAuthnEnabled"`
		WebAuthnDevices []models.WebAuthnCredential `bson:"webAuthnDevices,omitempty" json:"webAuthnDevices,omitempty"`
	}

	var dbUsers []dbUser
	if err := cursor.All(ctx.Request.Context(), &dbUsers); err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch users"})

		return
	}

	// Map to public model with backward-compatible default: missing enabled -> true
	users := make([]models.UserView, 0, len(dbUsers))
	for _, u := range dbUsers {
		enabled := true
		if u.Enabled != nil {
			enabled = *u.Enabled
		}

		users = append(users, models.ToUserView(models.User{
			Username:        u.Username,
			Roles:           u.Roles,
			DisplayName:     u.DisplayName,
			Email:           u.Email,
			Avatar:          u.Avatar,
			Enabled:         enabled,
			LastLogin:       u.LastLogin,
			LastModified:    u.LastModified,
			TOTPEnabled:     u.TOTPEnabled,
			WebAuthnEnabled: u.WebAuthnEnabled,
			WebAuthnDevices: u.WebAuthnDevices,
		}))
	}

	ctx.JSON(http.StatusOK, models.UsersResponse{Users: users})
}

// GetUser handles the GET /api/users/:username endpoint
func (h *UserHandler) GetUser(ctx *gin.Context) {
	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	username := ctx.Param("username")
	// Use intermediate type with pointer for enabled to detect missing field
	type dbUser struct {
		Username        string                      `bson:"username" json:"username"`
		Roles           []string                    `bson:"roles" json:"roles"`
		DisplayName     string                      `bson:"displayName,omitempty" json:"displayName,omitempty"`
		Email           string                      `bson:"email,omitempty" json:"email,omitempty"`
		Avatar          string                      `bson:"avatar,omitempty" json:"avatar,omitempty"`
		Enabled         *bool                       `bson:"enabled" json:"enabled"`
		LastLogin       *string                     `bson:"lastLogin" json:"lastLogin"`
		LastModified    string                      `bson:"lastModified" json:"lastModified"`
		TOTPEnabled     bool                        `bson:"totpEnabled" json:"totpEnabled"`
		WebAuthnEnabled bool                        `bson:"webAuthnEnabled" json:"webAuthnEnabled"`
		WebAuthnDevices []models.WebAuthnCredential `bson:"webAuthnDevices,omitempty" json:"webAuthnDevices,omitempty"`
	}

	var du dbUser

	err := h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": username},
		options.FindOne().SetProjection(bson.M{"passwordHash": 0, "totpSecret": 0}),
	).Decode(&du)

	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch user"})
		}

		return
	}

	enabled := true
	if du.Enabled != nil {
		enabled = *du.Enabled
	}
	user := models.ToUserView(models.User{
		Username:        du.Username,
		Roles:           du.Roles,
		DisplayName:     du.DisplayName,
		Email:           du.Email,
		Avatar:          du.Avatar,
		Enabled:         enabled,
		LastLogin:       du.LastLogin,
		LastModified:    du.LastModified,
		TOTPEnabled:     du.TOTPEnabled,
		WebAuthnEnabled: du.WebAuthnEnabled,
		WebAuthnDevices: du.WebAuthnDevices,
	})

	ctx.JSON(http.StatusOK, models.UserResponse{User: user})
}

// CreateUser handles the POST /api/users endpoint
func (h *UserHandler) CreateUser(ctx *gin.Context) {
	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	var userRequest struct {
		Username string   `json:"username"`
		Password string   `json:"password"`
		Roles    []string `json:"roles"`
		Enabled  *bool    `json:"enabled"`
		models.User
	}

	if err := ctx.ShouldBindJSON(&userRequest); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Check if user already exists
	var existingUser models.User
	err := h.MongoDB.GetUserCollection().FindOne(ctx.Request.Context(), bson.M{"username": userRequest.Username}).Decode(&existingUser)
	if err == nil {
		ctx.JSON(http.StatusConflict, models.ErrorResponse{Error: "User already exists"})

		return
	} else if !errors.Is(err, mongo.ErrNoDocuments) {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to check user existence"})

		return
	}

	// Hash password
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(userRequest.Password), 12)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to hash password"})

		return
	}

	// Create user
	// Determine enabled status (default true)
	enabled := true
	if userRequest.Enabled != nil {
		enabled = *userRequest.Enabled
	}

	user := models.User{
		Username:     userRequest.Username,
		PasswordHash: string(passwordHash),
		Roles:        userRequest.Roles,
		DisplayName:  userRequest.DisplayName,
		Email:        userRequest.Email,
		Avatar:       userRequest.Avatar,
		Enabled:      enabled,
		LastLogin:    nil,
		LastModified: time.Now().Format(time.RFC3339),
	}

	// If roles is empty, set default role to "user"
	if len(user.Roles) == 0 {
		user.Roles = []string{"user"}
	}

	_, err = h.MongoDB.GetUserCollection().InsertOne(ctx.Request.Context(), user)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create user"})

		return
	}

	// Audit user creation
	WriteAudit(ctx, nilToMongo(h.MongoDB), models.AuditLogEntry{
		Action:  "user.create",
		Target:  user.Username,
		Details: map[string]interface{}{"roles": user.Roles, "enabled": user.Enabled},
	})

	// Return user without passwordHash
	ctx.JSON(http.StatusCreated, models.UserResponse{User: models.ToUserView(user)})
}

// UpdateUser handles the PUT /api/users/:username endpoint
func (h *UserHandler) UpdateUser(ctx *gin.Context) {
	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	username := ctx.Param("username")
	var userRequest struct {
		Password string   `json:"password"`
		Roles    []string `json:"roles"`
		Enabled  *bool    `json:"enabled"`
		models.User
	}

	if err := ctx.ShouldBindJSON(&userRequest); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Find user
	var user struct {
		Username string   `bson:"username"`
		Roles    []string `bson:"roles"`
		Enabled  *bool    `bson:"enabled"`
	}

	err := h.MongoDB.GetUserCollection().FindOne(ctx.Request.Context(), bson.M{"username": username}).Decode(&user)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch user"})
		}

		return
	}

	currentlyEnabled := true
	if user.Enabled != nil {
		currentlyEnabled = *user.Enabled
	}

	// Update user fields
	update := bson.M{}

	if userRequest.Password != "" {
		passwordHash, err := bcrypt.GenerateFromPassword([]byte(userRequest.Password), 12)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to hash password"})

			return
		}

		update["passwordHash"] = string(passwordHash)
	}

	if len(userRequest.Roles) > 0 {
		if !IsAdminContext(ctx) {
			if !sameRoles(userRequest.Roles, user.Roles) {
				ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Only admins can change roles"})

				return
			}
		} else {
			if currentlyEnabled && HasRole(user.Roles, "admin") && !HasRole(userRequest.Roles, "admin") {
				if err := h.ensureAnotherEnabledAdminExists(ctx, username); err != nil {
					ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})

					return
				}
			}

			update["roles"] = userRequest.Roles
		}
	}

	if userRequest.DisplayName != "" {
		update["displayName"] = userRequest.DisplayName
	}

	if userRequest.Email != "" {
		update["email"] = userRequest.Email
	}

	if userRequest.Avatar != "" {
		update["avatar"] = userRequest.Avatar
	}

	// Handle enabled status update with admin check
	if userRequest.Enabled != nil {
		if !IsAdminContext(ctx) {
			ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Only admins can change user enabled status"})

			return
		}

		// Prevent disabling current admin
		currentUserIfc, _ := ctx.Get("username")

		currentUsername, _ := currentUserIfc.(string)
		if currentUsername == username && HasRole(user.Roles, "admin") && !*userRequest.Enabled {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Cannot disable the current admin user"})

			return
		}

		if currentlyEnabled && HasRole(user.Roles, "admin") && !*userRequest.Enabled {
			if err := h.ensureAnotherEnabledAdminExists(ctx, username); err != nil {
				ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})

				return
			}
		}

		update["enabled"] = *userRequest.Enabled
	}

	if userRequest.LastLogin != nil {
		update["lastLogin"] = userRequest.LastLogin
	}

	// Update lastModified timestamp if not explicitly provided
	if userRequest.LastModified == "" {
		update["lastModified"] = time.Now().Format(time.RFC3339)
	} else {
		update["lastModified"] = userRequest.LastModified
	}

	// Update user
	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		ctx.Request.Context(),
		bson.M{"username": username},
		bson.M{"$set": update},
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update user"})

		return
	}

	// Get updated user
	var updatedUser models.User
	err = h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": username},
		options.FindOne().SetProjection(bson.M{"passwordHash": 0, "totpSecret": 0}),
	).Decode(&updatedUser)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch updated user"})

		return
	}

	// Audit user update (list updated fields, excluding passwordHash)
	updatedFields := []string{}
	for k := range update {
		if k == "passwordHash" {
			continue
		}
		updatedFields = append(updatedFields, k)
	}

	WriteAudit(ctx, nilToMongo(h.MongoDB), models.AuditLogEntry{
		Action:  "user.update",
		Target:  username,
		Details: map[string]interface{}{"fields": updatedFields},
	})

	ctx.JSON(http.StatusOK, models.UserResponse{User: models.ToUserView(updatedUser)})
}

// hasRole checks if a role exists in the slice
// helper: try to cast UserDatabase to *db.MongoDB (else return nil)
func nilToMongo(d db.UserDatabase) *db.MongoDB {
	if m, ok := d.(*db.MongoDB); ok {
		return m
	}

	return nil
}

// DeleteUser handles the DELETE /api/users/:username endpoint
func (h *UserHandler) DeleteUser(ctx *gin.Context) {
	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	username := ctx.Param("username")
	currentUsername := CurrentUsername(ctx)

	var user struct {
		Username string   `bson:"username"`
		Roles    []string `bson:"roles"`
		Enabled  *bool    `bson:"enabled"`
	}

	err := h.MongoDB.GetUserCollection().FindOne(ctx.Request.Context(), bson.M{"username": username}).Decode(&user)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch user"})
		}

		return
	}

	if currentUsername == username && HasRole(user.Roles, "admin") {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Cannot delete the current admin user"})

		return
	}

	currentlyEnabled := true
	if user.Enabled != nil {
		currentlyEnabled = *user.Enabled
	}

	if currentlyEnabled && HasRole(user.Roles, "admin") {
		if err := h.ensureAnotherEnabledAdminExists(ctx, username); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})

			return
		}
	}

	// Delete user
	result, err := h.MongoDB.GetUserCollection().DeleteOne(ctx.Request.Context(), bson.M{"username": username})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete user"})

		return
	}

	if result.DeletedCount == 0 {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Audit user deletion
	WriteAudit(ctx, nilToMongo(h.MongoDB), models.AuditLogEntry{
		Action: "user.delete",
		Target: username,
	})

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "User deleted successfully"})
}

func sameRoles(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}

	aCopy := append([]string(nil), a...)
	bCopy := append([]string(nil), b...)
	slices.Sort(aCopy)
	slices.Sort(bCopy)

	for idx := range aCopy {
		if aCopy[idx] != bCopy[idx] {
			return false
		}
	}

	return true
}

func (h *UserHandler) ensureAnotherEnabledAdminExists(ctx *gin.Context, excludedUsername string) error {
	filter := bson.M{
		"username": bson.M{"$ne": excludedUsername},
		"roles":    "admin",
		"$or": []bson.M{
			{"enabled": true},
			{"enabled": bson.M{"$exists": false}},
		},
	}

	adminCount, err := h.MongoDB.GetUserCollection().CountDocuments(ctx.Request.Context(), filter)
	if err != nil {
		return errors.New("failed to validate remaining admin users")
	}

	if adminCount == 0 {
		return errors.New("at least one enabled admin user must remain")
	}

	return nil
}
