package models

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
	PasswordHash string   `bson:"passwordHash" json:"passwordHash,omitempty"`
	Roles        []string `bson:"roles" json:"roles"`
	DisplayName  string   `bson:"displayName,omitempty" json:"displayName,omitempty"`
	Email        string   `bson:"email,omitempty" json:"email,omitempty"`
	Avatar       string   `bson:"avatar,omitempty" json:"avatar,omitempty"`
	Enabled      bool     `bson:"enabled" json:"enabled"`
	LastLogin    *string  `bson:"lastLogin" json:"lastLogin"`
	LastModified string   `bson:"lastModified" json:"lastModified"`
	// TOTP fields
	TOTPEnabled bool   `bson:"totpEnabled" json:"totpEnabled"`
	TOTPSecret  string `bson:"totpSecret,omitempty" json:"totpSecret,omitempty"`
	// WebAuthn fields
	WebAuthnEnabled bool                 `bson:"webAuthnEnabled" json:"webAuthnEnabled"`
	WebAuthnDevices []WebAuthnCredential `bson:"webAuthnDevices,omitempty" json:"webAuthnDevices,omitempty"`
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

// JWTConfig represents JWT configuration
type JWTConfig struct {
	JWTSecret          string `bson:"jwtSecret" json:"jwtSecret"`
	TokenExpiry        int    `bson:"tokenExpiry" json:"tokenExpiry"`
	RefreshTokenExpiry int    `bson:"refreshTokenExpiry" json:"refreshTokenExpiry"`
	RememberMeExpiry   int    `bson:"rememberMeExpiry" json:"rememberMeExpiry"`
}

// UserResponse represents a user response without the password hash
type UserResponse struct {
	User User `json:"user"`
}

// UsersResponse represents a list of users response
type UsersResponse struct {
	Users []User `json:"users"`
}

// ProfileResponse represents a profile response
type ProfileResponse struct {
	Profiles           []ProfileData `json:"profiles"`
	CurrentProfileName string        `json:"currentProfileName"`
}

// JWTConfigResponse represents a JWT configuration response
type JWTConfigResponse struct {
	JWTConfig JWTConfig `json:"jwtConfig"`
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

// LoginResponse represents a successful login response with JWT token
type LoginResponse struct {
	User         User   `json:"user"`
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken,omitempty"`
	ExpiresAt    int64  `json:"expiresAt,omitempty"`
}
