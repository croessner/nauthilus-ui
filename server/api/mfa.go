package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
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
		// Important for iOS Face ID: request discoverable credentials and user verification.
		// Do NOT set AuthenticatorAttachment, so both platform (Face ID/Touch ID) and cross‑platform keys remain eligible.
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationPreferred,
		},
	}

	webAuthn, err := webauthn.New(webAuthnConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create WebAuthn: %v", err)
	}

	// Log effective WebAuthn configuration for troubleshooting RP/Origin mismatches
	slog.Info("WebAuthn configured", "rpID", rpID, "rpDisplayName", rpDisplayName, "rpOrigins", origins)

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

	// Decode AAGUID if it was stored base64-encoded; otherwise leave empty
	var aaguidBytes []byte
	if cred.AAGUID != "" {
		if decoded, err := base64.StdEncoding.DecodeString(cred.AAGUID); err == nil && len(decoded) == 16 {
			aaguidBytes = decoded
		}
	}

	flags := webauthn.CredentialFlags{}
	if cred.BackupEligible != nil {
		flags.BackupEligible = *cred.BackupEligible
	}

	if cred.BackupState != nil {
		flags.BackupState = *cred.BackupState
	}

	return webauthn.Credential{
		ID:              id,
		PublicKey:       cred.PublicKey,
		AttestationType: "",
		Transport:       nil,
		Flags:           flags,
		Authenticator: webauthn.Authenticator{
			AAGUID:    aaguidBytes,
			SignCount: 0,
		},
	}
}

// Convert webauthn.Credential to models.WebAuthnCredential
func convertToModelCredential(cred webauthn.Credential, name string) models.WebAuthnCredential {
	now := time.Now().Format(time.RFC3339)
	be := cred.Flags.BackupEligible
	bs := cred.Flags.BackupState

	return models.WebAuthnCredential{
		ID:             base64.StdEncoding.EncodeToString(cred.ID),
		PublicKey:      cred.PublicKey,
		Name:           name,
		CreatedAt:      now,
		LastUsed:       now,
		AAGUID:         base64.StdEncoding.EncodeToString(cred.Authenticator.AAGUID),
		Authenticator:  "WebAuthn Device",
		BackupEligible: &be,
		BackupState:    &bs,
	}
}

// GetWebAuthnUser gets a user for WebAuthn operations
func (h *MFAHandler) GetWebAuthnUser(ctx context.Context, username string) (*WebAuthnUser, error) {
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(
		ctx,
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
func (h *MFAHandler) SetupTOTP(ctx *gin.Context) {
	var req SetupTOTPRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Find user by username
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": req.Username},
	).Decode(&user)

	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Generate TOTP key
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Nauthilus UI",
		AccountName: req.Username,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate TOTP key"})

		return
	}

	// Update user with TOTP secret (but don't enable it yet until verified)
	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		ctx.Request.Context(),
		bson.M{"username": req.Username},
		bson.M{"$set": bson.M{"totpSecret": key.Secret()}},
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update user"})

		return
	}

	// Return TOTP secret and QR code URL
	ctx.JSON(http.StatusOK, SetupTOTPResponse{
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
func (h *MFAHandler) VerifyTOTP(ctx *gin.Context) {
	var req VerifyTOTPRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Find user by username
	var user models.User
	err := h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": req.Username},
	).Decode(&user)

	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Verify TOTP token
	valid := totp.Validate(req.Token, user.TOTPSecret)
	if !valid {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Invalid TOTP token"})

		return
	}

	// If this is the first verification, enable TOTP for the user
	if !user.TOTPEnabled {
		_, err = h.MongoDB.GetUserCollection().UpdateOne(
			ctx.Request.Context(),
			bson.M{"username": req.Username},
			bson.M{"$set": bson.M{"totpEnabled": true}},
		)

		if err != nil {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to enable TOTP"})

			return
		}
	}

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "TOTP verified successfully"})
}

// DisableTOTPRequest represents a request to disable TOTP
type DisableTOTPRequest struct {
	Username string `json:"username" binding:"required"`
}

// DisableTOTP handles the POST /api/auth/totp/disable endpoint
func (h *MFAHandler) DisableTOTP(ctx *gin.Context) {
	var req DisableTOTPRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Update user to disable TOTP
	_, err := h.MongoDB.GetUserCollection().UpdateOne(
		ctx.Request.Context(),
		bson.M{"username": req.Username},
		bson.M{"$set": bson.M{
			"totpEnabled": false,
			"totpSecret":  "",
		}},
	)

	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})
		} else {
			ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to disable TOTP"})
		}

		return
	}

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "TOTP disabled successfully"})
}

// BeginRegistrationRequest represents a request to begin WebAuthn registration
type BeginRegistrationRequest struct {
	Username string `json:"username" binding:"required"`
}

// helper to derive scheme and host (optionally using X-Forwarded headers)
func deriveSchemeAndHost(r *http.Request) (string, string) {
	// Scheme
	scheme := r.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	// Host
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}

	return scheme, host
}

func stripPort(hostport string) string {
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}

	// If it doesn't include a port, return as-is
	return hostport
}

func ensureOriginAllowed(cfg *webauthn.Config, origin string) {
	for _, o := range cfg.RPOrigins {
		if o == origin {
			return
		}
	}

	cfg.RPOrigins = append(cfg.RPOrigins, origin)
}

// BeginWebAuthnRegistration handles the GET /api/auth/webauthn/begin-registration endpoint
func (h *MFAHandler) BeginWebAuthnRegistration(ctx *gin.Context) {
	username := ctx.Query("username")
	if username == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Username is required"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(ctx.Request.Context(), username)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Derive rpId and origin from request to satisfy Safari/iOS matching rules
	scheme, host := deriveSchemeAndHost(ctx.Request)
	rpID := stripPort(host)
	origin := fmt.Sprintf("%s://%s", scheme, host)

	// Ensure current origin is allowed
	ensureOriginAllowed(h.WebAuthn.Config, origin)

	// Begin registration with per-request overrides and platform-friendly hints
	options, sessionData, err := h.WebAuthn.BeginRegistration(
		user,
		webauthn.WithRegistrationRelyingPartyID(rpID),
		webauthn.WithPublicKeyCredentialHints([]protocol.PublicKeyCredentialHints{
			protocol.PublicKeyCredentialHintClientDevice,
			protocol.PublicKeyCredentialHintSecurityKey,
			protocol.PublicKeyCredentialHintHybrid,
		}),
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: fmt.Sprintf("Failed to begin registration: %v", err)})

		return
	}

	// Encode session data to base64 to send to client
	sessionDataBytes, err := json.Marshal(sessionData)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to encode session data"})

		return
	}

	sessionDataBase64 := base64.StdEncoding.EncodeToString(sessionDataBytes)

	// Return registration options with session data
	ctx.JSON(http.StatusOK, gin.H{
		"publicKey":   options,
		"sessionData": sessionDataBase64,
		"rpId":        rpID,
		"origin":      origin,
	})
}

// FinishRegistrationRequest represents a request to finish WebAuthn registration
type FinishRegistrationRequest struct {
	Name        string `json:"name" binding:"required"`
	SessionData string `json:"sessionData" binding:"required"`
	// The credential fields will be parsed from the request body
}

// FinishWebAuthnRegistration handles the POST /api/auth/webauthn/finish-registration endpoint
func (h *MFAHandler) FinishWebAuthnRegistration(ctx *gin.Context) {
	// Read the raw request body
	bodyBytes, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to read request body"})

		return
	}

	// Close the original body and replace it with a new reader for later use
	_ = ctx.Request.Body.Close()
	ctx.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	// Parse the request to get the name and session data
	var req FinishRegistrationRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})

		return
	}

	// Decode session data from base64
	sessionDataBytes, err := base64.StdEncoding.DecodeString(req.SessionData)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid session data"})

		return
	}

	// Unmarshal session data
	var sessionData webauthn.SessionData
	if err := json.Unmarshal(sessionDataBytes, &sessionData); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to decode session data"})

		return
	}

	// Extract username from session data
	usernameStr := string(sessionData.UserID)

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(ctx.Request.Context(), usernameStr)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Parse response using the original request body
	response, err := protocol.ParseCredentialCreationResponseBody(ctx.Request.Body)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: fmt.Sprintf("Failed to parse response: %v", err)})

		return
	}

	// Finish registration
	credential, err := h.WebAuthn.CreateCredential(user, sessionData, response)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: fmt.Sprintf("Failed to create credential: %v", err)})

		return
	}

	// Convert credential to model
	modelCredential := convertToModelCredential(*credential, req.Name)

	// Update user with new credential
	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		ctx.Request.Context(),
		bson.M{"username": usernameStr},
		bson.M{
			"$push": bson.M{"webAuthnDevices": modelCredential},
			"$set":  bson.M{"webAuthnEnabled": true},
		},
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update user"})

		return
	}

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "WebAuthn credential registered successfully"})
}

// BeginWebAuthnLogin handles the GET /api/auth/webauthn/begin-login endpoint
func (h *MFAHandler) BeginWebAuthnLogin(ctx *gin.Context) {
	username := ctx.Query("username")
	if username == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Username is required"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(ctx.Request.Context(), username)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Derive rpId and origin from request and ensure origin is allowed
	scheme, host := deriveSchemeAndHost(ctx.Request)
	rpID := stripPort(host)
	origin := fmt.Sprintf("%s://%s", scheme, host)

	ensureOriginAllowed(h.WebAuthn.Config, origin)

	// Begin login with per-request rpId and platform-friendly hints
	options, sessionData, err := h.WebAuthn.BeginLogin(
		user,
		webauthn.WithLoginRelyingPartyID(rpID),
		webauthn.WithAssertionPublicKeyCredentialHints([]protocol.PublicKeyCredentialHints{
			protocol.PublicKeyCredentialHintClientDevice,
			protocol.PublicKeyCredentialHintSecurityKey,
			protocol.PublicKeyCredentialHintHybrid,
		}),
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: fmt.Sprintf("Failed to begin login: %v", err)})

		return
	}

	// Store session data in context (for completeness)
	ctx.Set("webauthnSessionData", sessionData)
	ctx.Set("webauthnUsername", username)

	// Encode session data to base64 to send to client (align with registration)
	sessionDataBytes, err := json.Marshal(sessionData)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to encode session data"})

		return
	}

	sessionDataBase64 := base64.StdEncoding.EncodeToString(sessionDataBytes)

	// Return login options with session data
	ctx.JSON(http.StatusOK, gin.H{
		"publicKey":   options,
		"sessionData": sessionDataBase64,
		"rpId":        rpID,
		"origin":      origin,
	})
}

// tryValidateWithBackupEligibleRecovery attempts to recover BackupEligible flag mismatches for a given response
// by retrying validation with both true and false values and persisting the resolved flag.
func (h *MFAHandler) tryValidateWithBackupEligibleRecovery(ctx *gin.Context, user *WebAuthnUser, sessionData webauthn.SessionData, response *protocol.ParsedCredentialAssertionData, usernameStr string) (*webauthn.Credential, bool) {
	// Identify the credential by RawID from the response
	rawIDB64 := base64.StdEncoding.EncodeToString(response.RawID)
	// Try toggling the stored BackupEligible flag in-memory and validating again
	for idx := range user.Credentials {
		if base64.StdEncoding.EncodeToString(user.Credentials[idx].ID) == rawIDB64 {
			// Try with BackupEligible=true
			userTry := *user
			userTry.Credentials = make([]webauthn.Credential, len(user.Credentials))
			copy(userTry.Credentials, user.Credentials)
			userTry.Credentials[idx].Flags.BackupEligible = true

			if cred2, err2 := h.WebAuthn.ValidateLogin(&userTry, sessionData, response); err2 == nil {
				// Persist resolved flag to DB (best-effort)
				_, _ = h.MongoDB.GetUserCollection().UpdateOne(
					ctx.Request.Context(),
					bson.M{"username": usernameStr, "webAuthnDevices.id": rawIDB64},
					bson.M{"$set": bson.M{"webAuthnDevices.$.backupEligible": true}},
				)

				return cred2, true
			}

			// Try with BackupEligible=false
			userTry2 := *user
			userTry2.Credentials = make([]webauthn.Credential, len(user.Credentials))
			copy(userTry2.Credentials, user.Credentials)
			userTry2.Credentials[idx].Flags.BackupEligible = false

			if cred3, err3 := h.WebAuthn.ValidateLogin(&userTry2, sessionData, response); err3 == nil {
				// Persist resolved flag to DB (best-effort)
				_, _ = h.MongoDB.GetUserCollection().UpdateOne(
					ctx.Request.Context(),
					bson.M{"username": usernameStr, "webAuthnDevices.id": rawIDB64},
					bson.M{"$set": bson.M{"webAuthnDevices.$.backupEligible": false}},
				)

				return cred3, true
			}

			break
		}
	}

	return nil, false
}

// FinishWebAuthnLogin handles the POST /api/auth/webauthn/finish-login endpoint
func (h *MFAHandler) FinishWebAuthnLogin(ctx *gin.Context) {
	// Read the raw request body
	bodyBytes, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to read request body"})

		return
	}

	// Close the original body and replace it with a new reader for later use
	_ = ctx.Request.Body.Close()
	ctx.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	// Try to parse the request to get the session data
	type FinishLoginRequest struct {
		SessionData string `json:"sessionData"`
	}

	var req FinishLoginRequest
	_ = json.Unmarshal(bodyBytes, &req)

	var sessionData webauthn.SessionData
	var usernameStr string

	if req.SessionData != "" {
		// Decode session data from base64
		sessionDataBytes, err := base64.StdEncoding.DecodeString(req.SessionData)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid session data"})

			return
		}

		// Unmarshal session data
		if err := json.Unmarshal(sessionDataBytes, &sessionData); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Failed to decode session data"})

			return
		}

		// Extract username from session data
		usernameStr = string(sessionData.UserID)
	} else {
		// Fallback to context (backward compatibility)
		sd, exists := ctx.Get("webauthnSessionData")
		if !exists {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "No session data found"})

			return
		}

		sessionData = sd.(webauthn.SessionData)

		if un, ok := ctx.Get("webauthnUsername"); ok {
			usernameStr = un.(string)
		} else {
			usernameStr = string(sessionData.UserID)
		}
	}

	// Get user for WebAuthn
	user, err := h.GetWebAuthnUser(ctx.Request.Context(), usernameStr)
	if err != nil {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "User not found"})

		return
	}

	// Parse response using the original request body
	response, err := protocol.ParseCredentialRequestResponseBody(ctx.Request.Body)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: fmt.Sprintf("Failed to parse response: %v", err)})

		return
	}

	// Finish login
	credential, err := h.WebAuthn.ValidateLogin(user, sessionData, response)
	if err != nil {
		// Attempt a targeted recovery for BackupEligible flag mismatches from older records
		if strings.Contains(err.Error(), "BackupEligible") {
			if credRecovered, ok := h.tryValidateWithBackupEligibleRecovery(ctx, user, sessionData, response, usernameStr); ok {
				credential = credRecovered
				err = nil
			}
		}

		if err != nil {
			// Enhance diagnostics for RP/Origin issues while keeping client response generic
			rpID := h.WebAuthn.Config.RPID
			rpOrigins := h.WebAuthn.Config.RPOrigins
			requestOrigin := ctx.Request.Header.Get("Origin")
			requestReferer := ctx.Request.Referer()
			host := ctx.Request.Host

			// Attempt to extract additional info from protocol.Error if available
			var devInfo any

			var perr *protocol.Error
			if errors.As(err, &perr) {
				devInfo = perr.DevInfo
			}

			slog.Error("WebAuthn finish-login validation failed",
				"username", usernameStr,
				"rpID", rpID,
				"rpOrigins", rpOrigins,
				"requestOrigin", requestOrigin,
				"referer", requestReferer,
				"host", host,
				"error", err,
				"devInfo", devInfo,
			)
			ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: fmt.Sprintf("Failed to validate login: %v", err)})

			return
		}
	}

	// Update last used timestamp for the credential
	now := time.Now().Format(time.RFC3339)
	credentialID := base64.StdEncoding.EncodeToString(credential.ID)

	_, err = h.MongoDB.GetUserCollection().UpdateOne(
		ctx.Request.Context(),
		bson.M{
			"username":           usernameStr,
			"webAuthnDevices.id": credentialID,
		},
		bson.M{"$set": bson.M{"webAuthnDevices.$.lastUsed": now}},
	)

	if err != nil {
		// Log error but don't fail the login
		fmt.Printf("Failed to update credential last used: %v\n", err)
	}

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "WebAuthn login successful"})
}

// RemoveWebAuthnCredential handles the DELETE /api/auth/webauthn/credential/:id endpoint
func (h *MFAHandler) RemoveWebAuthnCredential(ctx *gin.Context) {
	username := ctx.Query("username")
	if username == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Username is required"})

		return
	}

	credentialID := ctx.Param("id")
	if credentialID == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Credential ID is required"})

		return
	}

	// If MongoDB is not connected, return error
	if !h.MongoDB.IsConnectedToMongoDB() {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Database not connected"})

		return
	}

	// Remove credential from user
	result, err := h.MongoDB.GetUserCollection().UpdateOne(
		ctx.Request.Context(),
		bson.M{"username": username},
		bson.M{"$pull": bson.M{"webAuthnDevices": bson.M{"id": credentialID}}},
	)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to remove credential"})

		return
	}

	if result.ModifiedCount == 0 {
		ctx.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Credential not found"})

		return
	}

	// Check if user has any credentials left
	var user models.User
	err = h.MongoDB.GetUserCollection().FindOne(
		ctx.Request.Context(),
		bson.M{"username": username},
	).Decode(&user)

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to get user"})

		return
	}

	// If no credentials left, disable WebAuthn
	if len(user.WebAuthnDevices) == 0 {
		_, err = h.MongoDB.GetUserCollection().UpdateOne(
			ctx.Request.Context(),
			bson.M{"username": username},
			bson.M{"$set": bson.M{"webAuthnEnabled": false}},
		)

		if err != nil {
			// Log error but don't fail the operation
			fmt.Printf("Failed to disable WebAuthn: %v\n", err)
		}
	}

	ctx.JSON(http.StatusOK, models.MessageResponse{Message: "WebAuthn credential removed successfully"})
}
