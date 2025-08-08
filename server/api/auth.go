package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"golang.org/x/crypto/bcrypt"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// AuthHandler handles authentication requests
type AuthHandler struct {
	MongoDB *db.MongoDB
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(mongoDB *db.MongoDB) *AuthHandler {
	return &AuthHandler{
		MongoDB: mongoDB,
	}
}

// generateToken creates a JWT token for the given user
func (h *AuthHandler) generateToken(user *models.User, expiryTime int) (string, int64, error) {
	// Get JWT config
	jwtConfig, err := h.MongoDB.GetJWTConfig()
	if err != nil {
		slog.Error("Failed to get JWT config", "error", err)
		return "", 0, err
	}

	// Create token expiration time
	expiresAt := time.Now().Add(time.Duration(expiryTime) * time.Second).Unix()

	// Create the claims
	claims := jwt.MapClaims{
		"sub":   user.Username,
		"roles": user.Roles,
		"exp":   expiresAt,
		"iat":   time.Now().Unix(),
	}

	// Create the token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign the token with the secret
	tokenString, err := token.SignedString([]byte(jwtConfig.Secret))
	if err != nil {
		slog.Error("Failed to sign token", "error", err)
		return "", 0, err
	}

	return tokenString, expiresAt, nil
}

// RegisterRoutes registers the authentication routes
func (h *AuthHandler) RegisterRoutes(router *gin.Engine) {
	router.POST("/api/auth/login", h.Login)
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	MfaVerified bool   `json:"mfaVerified"`
}

// Login handles the POST /api/auth/login endpoint
func (h *AuthHandler) Login(ctx *gin.Context) {
	slog.Info("Login attempt", "path", ctx.Request.URL.Path, "method", ctx.Request.Method)

	var loginRequest LoginRequest
	if err := ctx.ShouldBindJSON(&loginRequest); err != nil {
		slog.Warn("Invalid login request body", "error", err)
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	slog.Info("Login request received", "username", loginRequest.Username)

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		slog.Error("MongoDB not connected during login attempt")
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})
		return
	}

	// Find user by username
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(
		context.Background(),
		bson.M{"username": loginRequest.Username},
	).Decode(&user)

	if err != nil {
		slog.Warn("User not found during login", "username", loginRequest.Username, "error", err)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid username or password"})
		return
	}

	slog.Info("User found during login", "username", user.Username, "roles", user.Roles)

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(loginRequest.Password))
	if err != nil {
		slog.Warn("Invalid password during login", "username", loginRequest.Username, "error", err)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid username or password"})
		return
	}

	slog.Info("Password verified successfully", "username", loginRequest.Username)

	// Check if MFA is required and not already verified
	if !loginRequest.MfaVerified {
		// Determine enabled MFA methods
		hasTOTP := user.TOTPEnabled
		hasWebAuthn := user.WebAuthnEnabled && len(user.WebAuthnDevices) > 0

		if hasTOTP && hasWebAuthn {
			// Both methods available: let the client choose
			ctx.JSON(http.StatusOK, models.MFARequiredResponse{
				MFARequired:     true,
				MFAType:         "choice",
				Username:        user.Username,
				TotpEnabled:     true,
				WebAuthnEnabled: true,
			})
			return
		} else if hasTOTP {
			// Only TOTP available
			ctx.JSON(http.StatusOK, models.MFARequiredResponse{
				MFARequired:     true,
				MFAType:         "totp",
				Username:        user.Username,
				TotpEnabled:     true,
				WebAuthnEnabled: false,
			})
			return
		} else if hasWebAuthn {
			// Only WebAuthn available
			ctx.JSON(http.StatusOK, models.MFARequiredResponse{
				MFARequired:     true,
				MFAType:         "webauthn",
				Username:        user.Username,
				TotpEnabled:     false,
				WebAuthnEnabled: true,
			})
			return
		}
	} else {
		slog.Info("MFA verification bypassed due to mfaVerified flag", "username", loginRequest.Username)
	}

	// Get JWT config for token expiry times
	jwtConfig, err := h.MongoDB.GetJWTConfig()
	if err != nil {
		slog.Error("Failed to get JWT config", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate authentication token"})
		return
	}

	slog.Info("JWT config retrieved", "secret_length", len(jwtConfig.Secret), "token_expiry", jwtConfig.TokenExpiry, "refresh_token_expiry", jwtConfig.RefreshTokenExpiry)

	// Generate access token
	token, expiresAt, err := h.generateToken(&user, jwtConfig.TokenExpiry)
	if err != nil {
		slog.Error("Failed to generate token", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate authentication token"})
		return
	}

	slog.Info("Access token generated", "username", user.Username, "token_length", len(token), "expires_at", time.Unix(expiresAt, 0))

	// Generate refresh token
	refreshToken, refreshExpiresAt, err := h.generateToken(&user, jwtConfig.RefreshTokenExpiry)
	if err != nil {
		slog.Error("Failed to generate refresh token", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate refresh token"})
		return
	}

	slog.Info("Refresh token generated", "username", user.Username, "token_length", len(refreshToken), "expires_at", time.Unix(refreshExpiresAt, 0))

	// Return user without passwordHash and with tokens
	user.PasswordHash = ""

	// Create response
	response := models.LoginResponse{
		User:         user,
		Token:        token,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
	}

	slog.Info("Sending login response", "username", user.Username, "token_present", token != "", "refresh_token_present", refreshToken != "")

	// Send response
	ctx.JSON(http.StatusOK, response)
}
