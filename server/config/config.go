package config

import (
	"os"
	"strconv"
)

// Config holds all configuration values for the application.
type Config struct {
	// Frontend server configuration
	// FrontendPort is the port number the frontend server will listen on.
	FrontendPort string
	// FrontendAddress is the IP address the frontend server will bind to.
	FrontendAddress string

	// Proxy server configuration
	// ProxyPort is the port number the proxy server will listen on.
	ProxyPort string
	// ProxyAddress is the IP address the proxy server will bind to.
	ProxyAddress string
	// ReactProxyPort is the port number the React application will use to connect to the proxy server.
	ReactProxyPort string

	// MongoDB configuration
	// MongoURI is the connection string for MongoDB.
	MongoURI string

	// JWT configuration
	// JWTSecret is the secret key used to sign JWT tokens.
	JWTSecret string
	// TokenExpiry is the expiration time for JWT tokens in seconds.
	TokenExpiry int
	// RefreshTokenExpiry is the expiration time for refresh tokens in seconds.
	RefreshTokenExpiry int
	// RememberMeExpiry is the expiration time for "remember me" tokens in seconds.
	RememberMeExpiry int

	// WebAuthn configuration
	// WebAuthnRPID is the Relying Party ID for WebAuthn.
	WebAuthnRPID string
	// WebAuthnRPDisplayName is the Relying Party display name for WebAuthn.
	WebAuthnRPDisplayName string

	// OIDC configuration (optional)
	OIDCEnabled       bool
	OIDCIssuer        string
	OIDCClientID      string
	OIDCClientSecret  string
	OIDCScopes        string // space-separated scopes, default: "openid profile email"
	OIDCRoleClaim     string // claim to extract roles from, e.g., "roles" or "realm_access.roles"
	OIDCUsernameClaim string // preferred_username, email, or sub
}

// LoadConfig loads configuration from environment variables.
// It returns a Config struct with values from environment variables or default values.
func LoadConfig() *Config {
	config := &Config{
		// Frontend server configuration
		FrontendPort:    getEnv("FRONTEND_PORT", "3001"),
		FrontendAddress: getEnv("FRONTEND_ADDRESS", "0.0.0.0"),

		// Proxy server configuration
		ProxyPort:    getEnv("PROXY_PORT", "3002"),
		ProxyAddress: getEnv("PROXY_ADDRESS", "0.0.0.0"),
		// Use REACT_APP_PROXY_PORT if set, otherwise default to ProxyPort
		ReactProxyPort: getEnv("REACT_APP_PROXY_PORT", getEnv("PROXY_PORT", "3002")),

		// MongoDB configuration
		MongoURI: getEnv("MONGODB_URI", "mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin"),

		// JWT configuration
		JWTSecret:          getEnv("REACT_APP_JWT_SECRET", "nauthilus-ui-default-secret-key-change-in-production"),
		TokenExpiry:        getEnvAsInt("REACT_APP_TOKEN_EXPIRY", 3600),
		RefreshTokenExpiry: getEnvAsInt("REACT_APP_REFRESH_TOKEN_EXPIRY", 86400),
		RememberMeExpiry:   getEnvAsInt("REACT_APP_REMEMBER_ME_EXPIRY", 86400),

		// WebAuthn configuration
		WebAuthnRPID:          getEnv("WEBAUTHN_RP_ID", ""),
		WebAuthnRPDisplayName: getEnv("WEBAUTHN_RP_DISPLAY_NAME", "Nauthilus UI"),

		// OIDC configuration (optional)
		OIDCEnabled:       getEnv("REACT_APP_OIDC_ENABLED", "false") == "true",
		OIDCIssuer:        getEnv("REACT_APP_OIDC_ISSUER", ""),
		OIDCClientID:      getEnv("REACT_APP_OIDC_CLIENT_ID", ""),
		OIDCClientSecret:  getEnv("REACT_APP_OIDC_CLIENT_SECRET", ""),
		OIDCScopes:        getEnv("REACT_APP_OIDC_SCOPES", "openid profile email"),
		OIDCRoleClaim:     getEnv("REACT_APP_OIDC_ROLE_CLAIM", "roles"),
		OIDCUsernameClaim: getEnv("REACT_APP_OIDC_USERNAME_CLAIM", "preferred_username"),
	}

	return config
}

// getEnv retrieves the environment variable for the given key.
// If the environment variable is not set, it returns the defaultValue.
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	return value
}

// getEnvAsInt retrieves the environment variable for the given key and converts it to an integer.
// If the environment variable is not set or cannot be converted to an integer,
// it returns the defaultValue.
func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}

	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}

	return value
}
