package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"golang.org/x/crypto/bcrypt"

	"nauthilus-ui/server/config"
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

// RegisterRoutes registers the authentication routes
func (h *AuthHandler) RegisterRoutes(router *gin.Engine) {
	var appConfig *config.Config
	if h.MongoDB != nil {
		appConfig = h.MongoDB.Config
	}

	// Apply rate limiting to login endpoint
	router.GET("/api/auth/csrf", h.CSRF)
	router.POST("/api/auth/login", LoginRateLimitMiddleware(), AdaptiveCaptchaMiddleware(loginIPLimiter, appConfig), h.Login)
	router.POST("/api/auth/refresh", h.Refresh)
	router.POST("/api/auth/logout", h.Logout)
	router.GET("/api/auth/me", h.Me)
}

// CSRF ensures a readable CSRF cookie exists for double-submit protection.
func (h *AuthHandler) CSRF(ctx *gin.Context) {
	if _, err := EnsureCSRFCookie(ctx); err != nil {
		slog.Error("Failed to ensure CSRF cookie", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to initialize CSRF protection"})
		return
	}

	ctx.Header("Cache-Control", "no-store")
	ctx.Status(http.StatusNoContent)
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
	RememberMe bool   `json:"rememberMe"`
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

	// Determine enabled MFA methods after password verification.
	hasTOTP := user.TOTPEnabled
	hasWebAuthn := user.WebAuthnEnabled && len(user.WebAuthnDevices) > 0

	if hasTOTP || hasWebAuthn {
		if err := startPendingMFALogin(ctx, h.MongoDB, user.Username, loginRequest.RememberMe); err != nil {
			slog.Error("Failed to create pending MFA session", "username", user.Username, "error", err)
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to start MFA challenge"})
			return
		}

		mfaType := "choice"
		if hasTOTP && !hasWebAuthn {
			mfaType = "totp"
		} else if hasWebAuthn && !hasTOTP {
			mfaType = "webauthn"
		}

		ctx.JSON(http.StatusOK, models.MFARequiredResponse{
			MFARequired:     true,
			MFAType:         mfaType,
			Username:        user.Username,
			TotpEnabled:     hasTOTP,
			WebAuthnEnabled: hasWebAuthn,
		})
		return
	}

	clearPendingMFASession(ctx)
	response, err := issueLoginResponse(ctx, h.MongoDB, &user, loginRequest.RememberMe)
	if err != nil {
		slog.Error("Failed to generate login response", "username", user.Username, "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to establish authenticated session"})
		return
	}

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
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Refresh session required"})
		return
	}

	session, err := findOpaqueSession(ctx.Request.Context(), h.MongoDB, cookie.Value, sessionKindRefresh)
	if err != nil {
		if errors.Is(err, errSessionNotFound) {
			slog.Warn("Refresh: refresh session not found or expired")
			ClearAuthCookies(ctx)
			ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Refresh session expired"})
			return
		}

		slog.Error("Refresh: failed to load refresh session", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Internal server error"})
		return
	}

	// Load user (optional, to include in response)
	user, err := h.MongoDB.GetUserByUsername(session.Username)
	if err != nil || user == nil {
		_ = deleteAllOpaqueSessionsForUser(ctx.Request.Context(), h.MongoDB, session.Username)
		ClearAuthCookies(ctx)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "User not found"})
		return
	}
	if !user.Enabled {
		_ = deleteAllOpaqueSessionsForUser(ctx.Request.Context(), h.MongoDB, session.Username)
		ClearAuthCookies(ctx)
		ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User account is disabled"})
		return
	}

	_ = deleteOpaqueSession(ctx.Request.Context(), h.MongoDB, cookie.Value, sessionKindRefresh)
	if accessToken := readAccessTokenFromRequest(ctx.Request); accessToken != "" {
		_ = deleteOpaqueSession(ctx.Request.Context(), h.MongoDB, accessToken, sessionKindAccess)
	}

	response, err := issueLoginResponse(ctx, h.MongoDB, user, session.RememberMe)
	if err != nil {
		slog.Error("Refresh: failed to rotate session", "error", err)
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to refresh session"})
		return
	}

	ctx.JSON(http.StatusOK, response)
}

// Logout handles the POST /api/auth/logout endpoint.
func (h *AuthHandler) Logout(ctx *gin.Context) {
	actor := ""
	if username, _, err := OptionalRequestAuth(ctx, h.MongoDB); err == nil {
		actor = username
	}

	if accessToken := readAccessTokenFromRequest(ctx.Request); accessToken != "" {
		_ = deleteOpaqueSession(ctx.Request.Context(), h.MongoDB, accessToken, sessionKindAccess)
	}
	if cookie, err := ctx.Request.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
		_ = deleteOpaqueSession(ctx.Request.Context(), h.MongoDB, cookie.Value, sessionKindRefresh)
	}

	ClearAuthCookies(ctx)
	clearPendingMFASession(ctx)
	WriteAudit(ctx, h.MongoDB, models.AuditLogEntry{
		Actor:  actor,
		Action: "logout",
		IP:     getClientIP(ctx.Request),
	})

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "Logged out"})
}

// Me handles GET /api/auth/me based on the current opaque access session.
func (h *AuthHandler) Me(ctx *gin.Context) {
	username, _, err := OptionalRequestAuth(ctx, h.MongoDB)
	if err != nil {
		if IsNoRequestAuth(err) {
			ClearAuthCookies(ctx)
			ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Not authenticated"})
			return
		}

		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Internal server error"})
		return
	}

	user, err := h.MongoDB.GetUserByUsername(username)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Internal server error"})
		return
	}
	if user == nil {
		_ = deleteAllOpaqueSessionsForUser(ctx.Request.Context(), h.MongoDB, username)
		ClearAuthCookies(ctx)
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Not authenticated"})
		return
	}

	if !user.Enabled {
		_ = deleteAllOpaqueSessionsForUser(ctx.Request.Context(), h.MongoDB, username)
		ClearAuthCookies(ctx)
		ctx.JSON(http.StatusForbidden, models.ErrorResponse{Error: "User account is disabled"})
		return
	}

	ctx.JSON(http.StatusOK, models.UserResponse{User: models.ToUserView(*user)})
}
