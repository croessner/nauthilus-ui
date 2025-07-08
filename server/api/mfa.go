package api

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pquerna/otp/totp"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/models"
)

// MFAHandler handles multi-factor authentication requests
type MFAHandler struct {
	MongoDB  db.UserDatabase
	WebAuthn *webauthn.WebAuthn
}

// NewMFAHandler creates a new MFAHandler
func NewMFAHandler(mongoDB db.UserDatabase) (*MFAHandler, error) {
	// Get WebAuthn configuration from environment variables
	rpID := os.Getenv("WEBAUTHN_RP_ID")
	rpDisplayName := os.Getenv("WEBAUTHN_RP_DISPLAY_NAME")
	rpOrigins := os.Getenv("WEBAUTHN_RP_ORIGINS")

	// Use default values if environment variables are not set
	if rpDisplayName == "" {
		rpDisplayName = "Nauthilus UI"
	}

	// Auto-detect RPID if not explicitly set
	if rpID == "" {
		// Get server address from environment
		address := os.Getenv("API_ADDRESS")

		// Default to the server's address if it's not a wildcard address
		if address != "" && address != "0.0.0.0" && address != "::" {
			rpID = address
		} else {
			// Fall back to localhost if we can't determine the domain
			rpID = "localhost"
		}
	}

	// Parse RPOrigins from environment variable
	var origins []string
	if rpOrigins != "" {
		// Split by comma if multiple origins are provided
		origins = strings.Split(rpOrigins, ",")
		// Trim spaces from each origin
		for i, origin := range origins {
			origins[i] = strings.TrimSpace(origin)
		}
	} else {
		// Default origins based on the RPID
		if rpID == "localhost" {
			origins = []string{"http://localhost:3000", "http://localhost:3001"}
		} else {
			// For production, assume both http and https
			origins = []string{"https://" + rpID}
		}
	}

	// Initialize WebAuthn
	webAuthnConfig := &webauthn.Config{
		RPDisplayName:         rpDisplayName,
		RPID:                  rpID,
		RPOrigins:             origins,
		AttestationPreference: protocol.PreferNoAttestation,
	}

	webAuthn, err := webauthn.New(webAuthnConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create WebAuthn: %v", err)
	}

	return &MFAHandler{
		MongoDB:  mongoDB,
		WebAuthn: webAuthn,
	}, nil
}

// RegisterRoutes registers the MFA routes
func (h *MFAHandler) RegisterRoutes(router *gin.Engine) {
	// TOTP routes
	router.POST("/api/auth/totp/setup", h.SetupTOTP)
	router.POST("/api/auth/totp/verify", h.VerifyTOTP)
	router.POST("/api/auth/totp/disable", h.DisableTOTP)

	// WebAuthn routes
	router.GET("/api/auth/webauthn/begin-registration", h.BeginWebAuthnRegistration)
	router.POST("/api/auth/webauthn/finish-registration", h.FinishWebAuthnRegistration)
	router.GET("/api/auth/webauthn/begin-login", h.BeginWebAuthnLogin)
	router.POST("/api/auth/webauthn/finish-login", h.FinishWebAuthnLogin)
	router.DELETE("/api/auth/webauthn/credential/:id", h.RemoveWebAuthnCredential)
}

// WebAuthnUser implements the webauthn.User interface
type WebAuthnUser struct {
	ID          string
	Name        string
	DisplayName string
	Credentials []webauthn.Credential
}

// WebAuthnID returns the user's ID
func (u WebAuthnUser) WebAuthnID() []byte {
	return []byte(u.ID)
}

// WebAuthnName returns the user's username
func (u WebAuthnUser) WebAuthnName() string {
	return u.Name
}

// WebAuthnDisplayName returns the user's display name
func (u WebAuthnUser) WebAuthnDisplayName() string {
	return u.DisplayName
}

// WebAuthnIcon returns the user's icon
func (u WebAuthnUser) WebAuthnIcon() string {
	return ""
}

// WebAuthnCredentials returns the user's credentials
func (u WebAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.Credentials
}

// Convert models.WebAuthnCredential to webauthn.Credential
func convertToWebAuthnCredential(cred models.WebAuthnCredential) webauthn.Credential {
	id, _ := base64.StdEncoding.DecodeString(cred.ID)
	return webauthn.Credential{
		ID:              id,
		PublicKey:       cred.PublicKey,
		AttestationType: "",
		Transport:       nil,
		Flags:           webauthn.CredentialFlags{},
		Authenticator: webauthn.Authenticator{
			AAGUID:    []byte(cred.AAGUID),
			SignCount: 0,
		},
	}
}

// Convert webauthn.Credential to models.WebAuthnCredential
func convertToModelCredential(cred webauthn.Credential, name string) models.WebAuthnCredential {
	now := time.Now().Format(time.RFC3339)
	return models.WebAuthnCredential{
		ID:            base64.StdEncoding.EncodeToString(cred.ID),
		PublicKey:     cred.PublicKey,
		Name:          name,
		CreatedAt:     now,
		LastUsed:      now,
		AAGUID:        string(cred.Authenticator.AAGUID),
		Authenticator: "WebAuthn Device",
	}
}

// GetWebAuthnUser gets a user for WebAuthn operations
func (h *MFAHandler) GetWebAuthnUser(username string) (*WebAuthnUser, error) {
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(
		context.Background(),
		bson.M{"username": username},
	).Decode(&user)

	if err != nil {
		return nil, err
	}

	// Convert models.WebAuthnCredential to webauthn.Credential
	var credentials []webauthn.Credential
	for _, cred := range user.WebAuthnDevices {
		credentials = append(credentials, convertToWebAuthnCredential(cred))
	}

	return &WebAuthnUser{
		ID:          username,
		Name:        username,
		DisplayName: user.DisplayName,
		Credentials: credentials,
	}, nil
}

// SetupTOTPRequest represents a request to set up TOTP
type SetupTOTPRequest struct {
	Username string `json:"username" binding:"required"`
}

// SetupTOTPResponse represents a response to set up TOTP
type SetupTOTPResponse struct {
	Secret string `json:"secret"`
	QRCode string `json:"qrCode"`
}

// SetupTOTP handles the POST /api/auth/totp/setup endpoint
func (h *MFAHandler) SetupTOTP(c *gin.Context) {
	var req SetupTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
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
		bson.M{"username": req.Username},
	).Decode(&user)

	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Generate TOTP key
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Nauthilus UI",
		AccountName: req.Username,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate TOTP key"})

		return
	}

	// Update user with TOTP secret (but don't enable it yet until verified)
	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		context.Background(),
		bson.M{"username": req.Username},
		bson.M{"$set": bson.M{"totpSecret": key.Secret()}},
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update user"})

		return
	}

	// Return TOTP secret and QR code URL
	c.JSON(http.StatusOK, SetupTOTPResponse{
		Secret: key.Secret(),
		QRCode: key.URL(),
	})
}

// VerifyTOTPRequest represents a request to verify TOTP
type VerifyTOTPRequest struct {
	Username string `json:"username" binding:"required"`
	Token    string `json:"token" binding:"required"`
}

// VerifyTOTP handles the POST /api/auth/totp/verify endpoint
func (h *MFAHandler) VerifyTOTP(c *gin.Context) {
	var req VerifyTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
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
		bson.M{"username": req.Username},
	).Decode(&user)

	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Verify TOTP token
	valid := totp.Validate(req.Token, user.TOTPSecret)
	if !valid {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid TOTP token"})

		return
	}

	// If this is the first verification, enable TOTP for the user
	if !user.TOTPEnabled {
		_, err = h.MongoDB.GetUserCollection().UpdateOne(
			context.Background(),
			bson.M{"username": req.Username},
			bson.M{"$set": bson.M{"totpEnabled": true}},
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to enable TOTP"})

			return
		}
	}

	c.JSON(http.StatusOK, models.MessageResponse{Message: "TOTP verified successfully"})
}

// DisableTOTPRequest represents a request to disable TOTP
type DisableTOTPRequest struct {
	Username string `json:"username" binding:"required"`
}

// DisableTOTP handles the POST /api/auth/totp/disable endpoint
func (h *MFAHandler) DisableTOTP(c *gin.Context) {
	var req DisableTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Update user to disable TOTP
	_, err := h.MongoDB.GetUserCollection().UpdateOne(
		context.Background(),
		bson.M{"username": req.Username},
		bson.M{"$set": bson.M{
			"totpEnabled": false,
			"totpSecret":  "",
		}},
	)

	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to disable TOTP"})
		}

		return
	}

	c.JSON(http.StatusOK, models.MessageResponse{Message: "TOTP disabled successfully"})
}

// BeginRegistrationRequest represents a request to begin WebAuthn registration
type BeginRegistrationRequest struct {
	Username string `json:"username" binding:"required"`
}

// BeginWebAuthnRegistration handles the GET /api/auth/webauthn/begin-registration endpoint
func (h *MFAHandler) BeginWebAuthnRegistration(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Username is required"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(username)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Begin registration
	options, sessionData, err := h.WebAuthn.BeginRegistration(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: fmt.Sprintf("Failed to begin registration: %v", err)})

		return
	}

	// Store session data in context
	c.Set("webauthnSessionData", sessionData)
	c.Set("webauthnUsername", username)

	// Return registration options
	c.JSON(http.StatusOK, options)
}

// FinishRegistrationRequest represents a request to finish WebAuthn registration
type FinishRegistrationRequest struct {
	Name string `json:"name" binding:"required"`
}

// FinishWebAuthnRegistration handles the POST /api/auth/webauthn/finish-registration endpoint
func (h *MFAHandler) FinishWebAuthnRegistration(c *gin.Context) {
	var req FinishRegistrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Get session data from context
	sessionData, exists := c.Get("webauthnSessionData")
	if !exists {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "No session data found"})

		return
	}

	username, exists := c.Get("webauthnUsername")
	if !exists {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "No username found"})

		return
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(username.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Parse response
	response, err := protocol.ParseCredentialCreationResponseBody(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: fmt.Sprintf("Failed to parse response: %v", err)})

		return
	}

	// Finish registration
	credential, err := h.WebAuthn.CreateCredential(user, sessionData.(webauthn.SessionData), response)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: fmt.Sprintf("Failed to create credential: %v", err)})

		return
	}

	// Convert credential to model
	modelCredential := convertToModelCredential(*credential, req.Name)

	// Update user with new credential
	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		context.Background(),
		bson.M{"username": username.(string)},
		bson.M{
			"$push": bson.M{"webAuthnDevices": modelCredential},
			"$set":  bson.M{"webAuthnEnabled": true},
		},
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update user"})

		return
	}

	c.JSON(http.StatusOK, models.MessageResponse{Message: "WebAuthn credential registered successfully"})
}

// BeginWebAuthnLogin handles the GET /api/auth/webauthn/begin-login endpoint
func (h *MFAHandler) BeginWebAuthnLogin(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Username is required"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(username)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Begin login
	options, sessionData, err := h.WebAuthn.BeginLogin(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: fmt.Sprintf("Failed to begin login: %v", err)})

		return
	}

	// Store session data in context
	c.Set("webauthnSessionData", sessionData)
	c.Set("webauthnUsername", username)

	// Return login options
	c.JSON(http.StatusOK, options)
}

// FinishWebAuthnLogin handles the POST /api/auth/webauthn/finish-login endpoint
func (h *MFAHandler) FinishWebAuthnLogin(c *gin.Context) {
	// Get session data from context
	sessionData, exists := c.Get("webauthnSessionData")
	if !exists {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "No session data found"})

		return
	}

	username, exists := c.Get("webauthnUsername")
	if !exists {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "No username found"})

		return
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(username.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Parse response
	response, err := protocol.ParseCredentialRequestResponseBody(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: fmt.Sprintf("Failed to parse response: %v", err)})

		return
	}

	// Finish login
	credential, err := h.WebAuthn.ValidateLogin(user, sessionData.(webauthn.SessionData), response)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: fmt.Sprintf("Failed to validate login: %v", err)})

		return
	}

	// Update last used timestamp for the credential
	now := time.Now().Format(time.RFC3339)
	credentialID := base64.StdEncoding.EncodeToString(credential.ID)
	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		context.Background(),
		bson.M{
			"username":           username.(string),
			"webAuthnDevices.id": credentialID,
		},
		bson.M{"$set": bson.M{"webAuthnDevices.$.lastUsed": now}},
	)

	if err != nil {
		// Log error but don't fail the login
		fmt.Printf("Failed to update credential last used: %v\n", err)
	}

	c.JSON(http.StatusOK, models.MessageResponse{Message: "WebAuthn login successful"})
}

// RemoveWebAuthnCredential handles the DELETE /api/auth/webauthn/credential/:id endpoint
func (h *MFAHandler) RemoveWebAuthnCredential(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Username is required"})

		return
	}

	credentialID := c.Param("id")
	if credentialID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Credential ID is required"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Remove credential from user
	result, err := h.MongoDB.GetUserCollection().UpdateOne(
		context.Background(),
		bson.M{"username": username},
		bson.M{"$pull": bson.M{"webAuthnDevices": bson.M{"id": credentialID}}},
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to remove credential"})

		return
	}

	if result.ModifiedCount == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Credential not found"})

		return
	}

	// Check if user has any credentials left
	var user models.User
	err = h.MongoDB.GetUserCollection().FindOne(
		context.Background(),
		bson.M{"username": username},
	).Decode(&user)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to get user"})

		return
	}

	// If no credentials left, disable WebAuthn
	if len(user.WebAuthnDevices) == 0 {
		_, err = h.MongoDB.GetUserCollection().UpdateOne(
			context.Background(),
			bson.M{"username": username},
			bson.M{"$set": bson.M{"webAuthnEnabled": false}},
		)

		if err != nil {
			// Log error but don't fail the operation
			fmt.Printf("Failed to disable WebAuthn: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, models.MessageResponse{Message: "WebAuthn credential removed successfully"})
}
