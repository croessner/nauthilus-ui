package models

// User represents a user in the system
type User struct {
	Username     string   `bson:"username" json:"username"`
	PasswordHash string   `bson:"passwordHash" json:"passwordHash,omitempty"`
	Roles        []string `bson:"roles" json:"roles"`
	DisplayName  string   `bson:"displayName,omitempty" json:"displayName,omitempty"`
	Email        string   `bson:"email,omitempty" json:"email,omitempty"`
	Avatar       string   `bson:"avatar,omitempty" json:"avatar,omitempty"`
	LastLogin    *string  `bson:"lastLogin" json:"lastLogin"`
	LastModified string   `bson:"lastModified" json:"lastModified"`
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
