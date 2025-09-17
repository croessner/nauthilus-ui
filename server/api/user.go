package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
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

// GetUsers handles the GET /api/users endpoint
func (h *UserHandler) GetUsers(ctx *gin.Context) {
	// If MongoDB is not connected, return default users
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusOK, models.UsersResponse{
			Users: []models.User{
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

	// Get all users without passwordHash
	cursor, err := h.MongoDB.GetUserCollection().Find(ctx.Request.Context(), bson.M{}, options.Find().SetProjection(bson.M{"passwordHash": 0}))
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
		TOTPSecret      string                      `bson:"totpSecret,omitempty" json:"totpSecret,omitempty"`
		WebAuthnEnabled bool                        `bson:"webAuthnEnabled" json:"webAuthnEnabled"`
		WebAuthnDevices []models.WebAuthnCredential `bson:"webAuthnDevices,omitempty" json:"webAuthnDevices,omitempty"`
	}

	var dbUsers []dbUser
	if err := cursor.All(ctx.Request.Context(), &dbUsers); err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch users"})

		return
	}

	// Map to public model with backward-compatible default: missing enabled -> true
	users := make([]models.User, 0, len(dbUsers))
	for _, u := range dbUsers {
		enabled := true
		if u.Enabled != nil {
			enabled = *u.Enabled
		}

		users = append(users, models.User{
			Username:        u.Username,
			Roles:           u.Roles,
			DisplayName:     u.DisplayName,
			Email:           u.Email,
			Avatar:          u.Avatar,
			Enabled:         enabled,
			LastLogin:       u.LastLogin,
			LastModified:    u.LastModified,
			TOTPEnabled:     u.TOTPEnabled,
			TOTPSecret:      u.TOTPSecret,
			WebAuthnEnabled: u.WebAuthnEnabled,
			WebAuthnDevices: u.WebAuthnDevices,
		})
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
		TOTPSecret      string                      `bson:"totpSecret,omitempty" json:"totpSecret,omitempty"`
		WebAuthnEnabled bool                        `bson:"webAuthnEnabled" json:"webAuthnEnabled"`
		WebAuthnDevices []models.WebAuthnCredential `bson:"webAuthnDevices,omitempty" json:"webAuthnDevices,omitempty"`
	}

	var du dbUser

	err := h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": username},
		options.FindOne().SetProjection(bson.M{"passwordHash": 0}),
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
	user := models.User{
		Username:        du.Username,
		Roles:           du.Roles,
		DisplayName:     du.DisplayName,
		Email:           du.Email,
		Avatar:          du.Avatar,
		Enabled:         enabled,
		LastLogin:       du.LastLogin,
		LastModified:    du.LastModified,
		TOTPEnabled:     du.TOTPEnabled,
		TOTPSecret:      du.TOTPSecret,
		WebAuthnEnabled: du.WebAuthnEnabled,
		WebAuthnDevices: du.WebAuthnDevices,
	}

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
	user.PasswordHash = ""
	ctx.JSON(http.StatusCreated, models.UserResponse{User: user})
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
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(ctx.Request.Context(), bson.M{"username": username}).Decode(&user)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch user"})
		}

		return
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
		update["roles"] = userRequest.Roles
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
		// Only admins can toggle enabled
		rolesIfc, _ := ctx.Get("roles")
		roles, _ := rolesIfc.([]string)
		isAdmin := false

		for _, r := range roles {
			if r == "admin" {
				isAdmin = true

				break
			}
		}

		if !isAdmin {
			ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Only admins can change user enabled status"})

			return
		}

		// Prevent disabling current admin
		currentUserIfc, _ := ctx.Get("username")

		currentUsername, _ := currentUserIfc.(string)
		if currentUsername == username && hasRole(user.Roles, "admin") && !*userRequest.Enabled {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Cannot disable the current admin user"})

			return
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
		options.FindOne().SetProjection(bson.M{"passwordHash": 0}),
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

	ctx.JSON(http.StatusOK, models.UserResponse{User: updatedUser})
}

// hasRole checks if a role exists in the slice
// helper: try to cast UserDatabase to *db.MongoDB (else return nil)
func nilToMongo(d db.UserDatabase) *db.MongoDB {
	if m, ok := d.(*db.MongoDB); ok {
		return m
	}

	return nil
}

func hasRole(roles []string, role string) bool {
	for _, r := range roles {
		if r == role {
			return true
		}
	}

	return false
}

// DeleteUser handles the DELETE /api/users/:username endpoint
func (h *UserHandler) DeleteUser(ctx *gin.Context) {
	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	username := ctx.Param("username")

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
