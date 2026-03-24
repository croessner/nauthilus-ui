package models

// LegalPage represents a legal page (e.g., imprint or privacy policy)
type LegalPage struct {
	Key       string `bson:"key" json:"key"`
	Title     string `bson:"title" json:"title"`
	ContentMD string `bson:"contentMd" json:"contentMd"`
	UpdatedAt string `bson:"updatedAt" json:"updatedAt"`
	UpdatedBy string `bson:"updatedBy" json:"updatedBy"`
}

// AuditLogEntry represents an immutable audit log record
// It captures who did what, when, from which IP, and optional context.
type AuditLogEntry struct {
	ID         string                 `bson:"_id,omitempty" json:"id"`
	Timestamp  string                 `bson:"ts" json:"ts"`
	Actor      string                 `bson:"actor" json:"actor"`
	ActorRoles []string               `bson:"actorRoles,omitempty" json:"actorRoles,omitempty"`
	IP         string                 `bson:"ip,omitempty" json:"ip,omitempty"`
	Action     string                 `bson:"action" json:"action"`                       // e.g., login, user.create, user.update, config.update
	Target     string                 `bson:"target,omitempty" json:"target,omitempty"`   // e.g., username or resource
	Method     string                 `bson:"method,omitempty" json:"method,omitempty"`   // e.g., password, webauthn, totp
	Details    map[string]interface{} `bson:"details,omitempty" json:"details,omitempty"` // sanitized non-sensitive info
}

// AuditLogResponse for listing logs with pagination
type AuditLogResponse struct {
	Items []AuditLogEntry `json:"items"`
	Total int64           `json:"total"`
}

// LegalResponse represents a list/map of legal pages
// We’ll return as a simple array for flexibility
// Keys should be one of: "imprint", "privacy"
type LegalResponse struct {
	Pages []LegalPage `json:"pages"`
}

// WebAuthnCredential represents a WebAuthn credential for a user
type WebAuthnCredential struct {
	ID             string `bson:"id" json:"id"`
	PublicKey      []byte `bson:"publicKey" json:"publicKey"`
	Name           string `bson:"name" json:"name"`
	CreatedAt      string `bson:"createdAt" json:"createdAt"`
	LastUsed       string `bson:"lastUsed" json:"lastUsed"`
	AAGUID         string `bson:"aaguid" json:"aaguid"`
	Authenticator  string `bson:"authenticator" json:"authenticator"`
	BackupEligible *bool  `bson:"backupEligible,omitempty" json:"backupEligible,omitempty"`
	BackupState    *bool  `bson:"backupState,omitempty" json:"backupState,omitempty"`
}

// User represents a user in the system
type User struct {
	Username     string   `bson:"username" json:"username"`
	PasswordHash string   `bson:"passwordHash" json:"-"`
	Roles        []string `bson:"roles" json:"roles"`
	DisplayName  string   `bson:"displayName,omitempty" json:"displayName,omitempty"`
	Email        string   `bson:"email,omitempty" json:"email,omitempty"`
	Avatar       string   `bson:"avatar,omitempty" json:"avatar,omitempty"`
	Enabled      bool     `bson:"enabled" json:"enabled"`
	LastLogin    *string  `bson:"lastLogin" json:"lastLogin"`
	LastModified string   `bson:"lastModified" json:"lastModified"`
	// TOTP fields
	TOTPEnabled bool   `bson:"totpEnabled" json:"totpEnabled"`
	TOTPSecret  string `bson:"totpSecret,omitempty" json:"-"`
	// WebAuthn fields
	WebAuthnEnabled bool                 `bson:"webAuthnEnabled" json:"webAuthnEnabled"`
	WebAuthnDevices []WebAuthnCredential `bson:"webAuthnDevices,omitempty" json:"webAuthnDevices,omitempty"`
}

// UserView is the sanitized API representation of a user.
type UserView struct {
	Username        string               `json:"username"`
	Roles           []string             `json:"roles"`
	DisplayName     string               `json:"displayName,omitempty"`
	Email           string               `json:"email,omitempty"`
	Avatar          string               `json:"avatar,omitempty"`
	Enabled         bool                 `json:"enabled"`
	LastLogin       *string              `json:"lastLogin"`
	LastModified    string               `json:"lastModified"`
	TOTPEnabled     bool                 `json:"totpEnabled"`
	WebAuthnEnabled bool                 `json:"webAuthnEnabled"`
	WebAuthnDevices []WebAuthnCredential `json:"webAuthnDevices,omitempty"`
}

// ProfileData represents a single profile configuration
type ProfileData struct {
	Name   string                 `bson:"name" json:"name"`
	Config map[string]interface{} `bson:"config" json:"config"`
}

// Profile represents a user's profile collection
type Profile struct {
	UserID             string        `bson:"userId" json:"userId"`
	Profiles           []ProfileData `bson:"profiles" json:"profiles"`
	CurrentProfileName string        `bson:"currentProfileName" json:"currentProfileName"`
}

// SessionConfig represents configurable application session lifetimes.
type SessionConfig struct {
	TokenExpiry        int `bson:"tokenExpiry" json:"tokenExpiry"`
	RefreshTokenExpiry int `bson:"refreshTokenExpiry" json:"refreshTokenExpiry"`
	RememberMeExpiry   int `bson:"rememberMeExpiry" json:"rememberMeExpiry"`
}

// SessionConfigView is the API representation of session configuration.
type SessionConfigView struct {
	TokenExpiry        int `json:"tokenExpiry"`
	RefreshTokenExpiry int `json:"refreshTokenExpiry"`
	RememberMeExpiry   int `json:"rememberMeExpiry"`
}

// SessionConfigUpdateRequest accepts updates for session configuration.
type SessionConfigUpdateRequest struct {
	TokenExpiry        *int `json:"tokenExpiry,omitempty"`
	RefreshTokenExpiry *int `json:"refreshTokenExpiry,omitempty"`
	RememberMeExpiry   *int `json:"rememberMeExpiry,omitempty"`
}

// UserResponse represents a user response without the password hash
type UserResponse struct {
	User UserView `json:"user"`
}

// UsersResponse represents a list of users response
type UsersResponse struct {
	Users []UserView `json:"users"`
}

// ProfileResponse represents a profile response
type ProfileResponse struct {
	Profiles           []ProfileData `json:"profiles"`
	CurrentProfileName string        `json:"currentProfileName"`
}

// SessionConfigResponse represents a session configuration response.
type SessionConfigResponse struct {
	SessionConfig SessionConfigView `json:"sessionConfig"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error string `json:"error"`
}

// MessageResponse represents a message response
type MessageResponse struct {
	Message string `json:"message"`
}

// HealthResponse represents a health check response
type HealthResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// RuntimeSettings represents runtime settings for a user profile
type RuntimeSettings struct {
	UserID      string                 `bson:"userId" json:"userId"`
	ProfileName string                 `bson:"profileName" json:"profileName"`
	Connection  map[string]interface{} `bson:"connection" json:"connection"`
	Hooks       map[string]interface{} `bson:"hooks" json:"hooks"`
}

// RuntimeSettingsResponse represents a runtime settings response
type RuntimeSettingsResponse struct {
	Connection map[string]interface{} `json:"connection"`
	Hooks      map[string]interface{} `json:"hooks"`
}

// MFARequiredResponse represents a response indicating that MFA is required
// When both methods are available, MFAType may be "choice" to let the client decide.
type MFARequiredResponse struct {
	MFARequired     bool   `json:"mfaRequired"`
	MFAType         string `json:"mfaType"`
	Username        string `json:"username"`
	TotpEnabled     bool   `json:"totpEnabled"`
	WebAuthnEnabled bool   `json:"webAuthnEnabled"`
}

// LoginResponse represents a successful login response after the server has
// established opaque session cookies.
type LoginResponse struct {
	User UserView `json:"user"`
}

// ToUserView strips sensitive fields from a user for API responses.
func ToUserView(user User) UserView {
	return UserView{
		Username:        user.Username,
		Roles:           user.Roles,
		DisplayName:     user.DisplayName,
		Email:           user.Email,
		Avatar:          user.Avatar,
		Enabled:         user.Enabled,
		LastLogin:       user.LastLogin,
		LastModified:    user.LastModified,
		TOTPEnabled:     user.TOTPEnabled,
		WebAuthnEnabled: user.WebAuthnEnabled,
		WebAuthnDevices: user.WebAuthnDevices,
	}
}

// ToSessionConfigView maps the stored configuration to its API form.
func ToSessionConfigView(sessionConfig SessionConfig) SessionConfigView {
	return SessionConfigView{
		TokenExpiry:        sessionConfig.TokenExpiry,
		RefreshTokenExpiry: sessionConfig.RefreshTokenExpiry,
		RememberMeExpiry:   sessionConfig.RememberMeExpiry,
	}
}
