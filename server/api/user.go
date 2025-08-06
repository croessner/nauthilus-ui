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

	var users []models.User
	if err := cursor.All(ctx.Request.Context(), &users); err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch users"})

		return
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
	var user models.User

	err := h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": username},
		options.FindOne().SetProjection(bson.M{"passwordHash": 0}),
	).Decode(&user)

	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch user"})
		}

		return
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
	user := models.User{
		Username:     userRequest.Username,
		PasswordHash: string(passwordHash),
		Roles:        userRequest.Roles,
		DisplayName:  userRequest.DisplayName,
		Email:        userRequest.Email,
		Avatar:       userRequest.Avatar,
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

	ctx.JSON(http.StatusOK, models.UserResponse{User: updatedUser})
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

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "User deleted successfully"})
}
