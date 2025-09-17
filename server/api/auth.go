package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"golang.org/x/crypto/bcrypt"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// dummyBcryptHash is a static bcrypt hash used for timing hardening when user is not found.
var dummyBcryptHash = []byte("$2a$10$7EqJtq98hPqEX7fNZaFWoOHiKxz6a1J2uQ8bV.QGA3E7Z2eax5cGa")

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
	// Apply rate limiting to login endpoint
	router.POST("/api/auth/login", LoginRateLimitMiddleware(), AdaptiveCaptchaMiddleware(loginIPLimiter), h.Login)
	router.POST("/api/auth/refresh", h.Refresh)
	router.POST("/api/auth/logout", h.Logout)
	router.GET("/api/auth/me", h.Me)
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	MfaVerified bool   `json:"mfaVerified"`
	RememberMe  bool   `json:"rememberMe"`
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

	// Find user by username (decode with pointer enabled for backward compatibility)
	type dbUser struct {
		Username        string                      `bson:"username"`
		PasswordHash    string                      `bson:"passwordHash"`
		Roles           []string                    `bson:"roles"`
		Enabled         *bool                       `bson:"enabled"`
		DisplayName     string                      `bson:"displayName,omitempty"`
		Email           string                      `bson:"email,omitempty"`
		Avatar          string                      `bson:"avatar,omitempty"`
		LastLogin       *string                     `bson:"lastLogin"`
		LastModified    string                      `bson:"lastModified"`
		TOTPEnabled     bool                        `bson:"totpEnabled"`
		TOTPSecret      string                      `bson:"totpSecret,omitempty"`
		WebAuthnEnabled bool                        `bson:"webAuthnEnabled"`
		WebAuthnDevices []models.WebAuthnCredential `bson:"webAuthnDevices,omitempty"`
	}

	var du dbUser
	err := h.MongoDB.GetUserCollection().FindOne(
		context.Background(),
		bson.M{"username": loginRequest.Username},
	).Decode(&du)

	if err != nil {
		slog.Warn("User not found during login", "username", loginRequest.Username, "error", err)
		// Timing hardening: perform a dummy bcrypt compare to equalize response time
		_ = bcrypt.CompareHashAndPassword(dummyBcryptHash, []byte(loginRequest.Password))
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid username or password"})
		return
	}

	enabled := true
	if du.Enabled != nil {
		enabled = *du.Enabled
	}
	user := models.User{
		Username:        du.Username,
		PasswordHash:    du.PasswordHash,
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

	slog.Info("User found during login", "username", user.Username, "roles", user.Roles)

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(loginRequest.Password))
	if err != nil {
		slog.Warn("Invalid password during login", "username", loginRequest.Username, "error", err)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid username or password"})
		return
	}

	slog.Info("Password verified successfully", "username", loginRequest.Username)

	// Block login for disabled users
	if !user.Enabled {
		slog.Warn("Login attempt for disabled user", "username", loginRequest.Username)
		ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User account is disabled"})

		return
	}

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

	// Determine access token expiry based on rememberMe flag
	accessExpiry := jwtConfig.TokenExpiry
	if loginRequest.RememberMe && jwtConfig.RememberMeExpiry > 0 {
		accessExpiry = jwtConfig.RememberMeExpiry
	}

	// Generate access token
	token, expiresAt, err := h.generateToken(&user, accessExpiry)
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

	// Set secure cookies for access and refresh tokens
	SetAuthCookies(ctx, token, expiresAt, refreshToken, refreshExpiresAt)

	slog.Info("Sending login response", "username", user.Username, "token_present", token != "", "refresh_token_present", refreshToken != "")

	// Write audit log for successful password login
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Timestamp: time.Now().Format(time.RFC3339),
		Actor:     user.Username,
		Action:    "login",
		Method:    "password",
		IP:        getClientIP(ctx.Request),
		Details:   map[string]interface{}{"rememberMe": loginRequest.RememberMe},
	})

	// Send response
	ctx.JSON(http.StatusOK, response)
}

// Refresh handles the POST /api/auth/refresh endpoint
func (h *AuthHandler) Refresh(ctx *gin.Context) {
	// Read refresh token from secure cookie
	cookie, err := ctx.Request.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		slog.Warn("Refresh: missing refresh cookie")
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Refresh token required"})
		return
	}

	// Get JWT config
	jwtConfig, err := h.MongoDB.GetJWTConfig()
	if err != nil {
		slog.Error("Refresh: failed to load JWT config", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Internal server error"})
		return
	}

	// Parse refresh token
	token, err := jwt.Parse(cookie.Value, func(token *jwt.Token) (interface{}, error) {
		return []byte(jwtConfig.Secret), nil
	})
	if err != nil || !token.Valid {
		slog.Warn("Refresh: invalid refresh token", "error", err)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid refresh token"})
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid refresh token claims"})
		return
	}

	// Check expiration
	if exp, ok := claims["exp"].(float64); ok {
		if time.Now().Unix() >= int64(exp) {
			ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Refresh token expired"})
			return
		}
	}

	username, _ := claims["sub"].(string)
	if username == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid refresh token subject"})
		return
	}

	// Load user (optional, to include in response)
	user, err := h.MongoDB.GetUserByUsername(username)
	if err != nil || user == nil {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "User not found"})
		return
	}

	// Generate new tokens (rotate refresh)
	accessToken, accessExp, err := h.generateToken(user, jwtConfig.TokenExpiry)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate access token"})
		return
	}
	newRefresh, refreshExp, err := h.generateToken(user, jwtConfig.RefreshTokenExpiry)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate refresh token"})
		return
	}

	// Set cookies
	SetAuthCookies(ctx, accessToken, accessExp, newRefresh, refreshExp)

	// Sanitize user for response
	user.PasswordHash = ""

	ctx.JSON(http.StatusOK, models.LoginResponse{
		User:         *user,
		Token:        accessToken,
		RefreshToken: newRefresh,
		ExpiresAt:    accessExp,
	})
}

// Logout handles the POST /api/auth/logout endpoint
func (h *AuthHandler) Logout(ctx *gin.Context) {
	// Try to extract actor from access token cookie or Authorization header
	actor := ""
	if c, err := ctx.Request.Cookie(accessCookieName); err == nil && c.Value != "" {
		if jwtConfig, err2 := h.MongoDB.GetJWTConfig(); err2 == nil {
			if t, err3 := jwt.Parse(c.Value, func(token *jwt.Token) (interface{}, error) { return []byte(jwtConfig.Secret), nil }); err3 == nil && t.Valid {
				if claims, ok := t.Claims.(jwt.MapClaims); ok {
					if sub, ok := claims["sub"].(string); ok {
						actor = sub
					}
				}
			}
		}
	}

	if actor == "" {
		authHeader := ctx.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				if jwtConfig, err2 := h.MongoDB.GetJWTConfig(); err2 == nil {
					if t, err3 := jwt.Parse(parts[1], func(token *jwt.Token) (interface{}, error) { return []byte(jwtConfig.Secret), nil }); err3 == nil && t.Valid {
						if claims, ok := t.Claims.(jwt.MapClaims); ok {
							if sub, ok := claims["sub"].(string); ok {
								actor = sub
							}
						}
					}
				}
			}
		}
	}

	// Clear cookies after extracting actor
	ClearAuthCookies(ctx)
	// Audit logout (ensure actor is set when possible)
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Actor:  actor,
		Action: "logout",
		IP:     getClientIP(ctx.Request),
	})

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Logged out"})
}

// Me handles GET /api/auth/me, returns current user based on JWT (header or cookie)
func (h *AuthHandler) Me(ctx *gin.Context) {
	var tokenString string

	// Prefer Authorization header
	authHeader := ctx.GetHeader("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			tokenString = parts[1]
		}
	}
	// Fallback to cookie
	if tokenString == "" {
		if c, err := ctx.Request.Cookie(accessCookieName); err == nil {
			tokenString = c.Value
		}
	}
	if tokenString == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Not authenticated"})
		return
	}

	jwtConfig, err := h.MongoDB.GetJWTConfig()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Internal server error"})
		return
	}

	// Parse access token
	t, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) { return []byte(jwtConfig.Secret), nil })
	if err != nil || !t.Valid {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid token"})
		return
	}
	claims, _ := t.Claims.(jwt.MapClaims)
	username, _ := claims["sub"].(string)
	if username == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid token"})
		return
	}

	user, err := h.MongoDB.GetUserByUsername(username)
	if err != nil || user == nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		return
	}
	user.PasswordHash = ""
	ctx.JSON(http.StatusOK, models.UserResponse{User: *user})
}
