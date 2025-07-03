package api

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"golang.org/x/crypto/bcrypt"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// AuthHandler handles authentication requests
type AuthHandler struct {
	MongoDB db.UserDatabase
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(mongoDB db.UserDatabase) *AuthHandler {
	return &AuthHandler{
		MongoDB: mongoDB,
	}
}

// RegisterRoutes registers the authentication routes
func (h *AuthHandler) RegisterRoutes(router *gin.Engine) {
	router.POST("/api/auth/login", h.Login)
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login handles the POST /api/auth/login endpoint
func (h *AuthHandler) Login(c *gin.Context) {
	var loginRequest LoginRequest
	if err := c.ShouldBindJSON(&loginRequest); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})
		return
	}

	// Find user by username
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(
		context.Background(),
		bson.M{"username": loginRequest.Username},
	).Decode(&user)

	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid username or password"})
		return
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(loginRequest.Password))
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid username or password"})
		return
	}

	// Return user without passwordHash
	user.PasswordHash = ""
	c.JSON(http.StatusOK, models.UserResponse{User: user})
}
