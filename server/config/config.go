package config

import (
	"os"
	"strconv"
	"strings"
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
	// If true, on boot the service will compare RememberMeExpiry from env with DB and update DB if different.
	SyncRememberMeFromEnvOnBoot bool

	// Cookie banner configuration
	// CookieBannerReshowDays controls how the cookie banner is re-shown:
	// -1: never show, 0: always show (dismissable for the current session), N: days until re-show
	CookieBannerReshowDays int

	// UI input limits
	// RawJsonMaxBytes controls the maximum allowed size (in bytes) for RAW JSON inputs in the UI.
	// The frontend will apply sanity clamping to [1024, 1048576]. Default is 8192 (8 KiB).
	RawJsonMaxBytes int

	// WebAuthn configuration
	// WebAuthnRPID is the Relying Party ID for WebAuthn.
	WebAuthnRPID string
	// WebAuthnRPDisplayName is the Relying Party display name for WebAuthn.
	WebAuthnRPDisplayName string

	// Audit log retention
	// AuditRetentionDays controls how many days of audit logs to keep. <=0 disables cleanup.
	AuditRetentionDays int
	// AuditCleanupIntervalHours controls how often the cleanup runs.
	AuditCleanupIntervalHours int

	// Audit policy configuration
	// AuditGetAudit controls whether GET/HEAD requests are audited. Default false.
	AuditGetAudit bool
	// AuditDedupWindowSec controls deduplication window (seconds) for repeated events. 0 disables dedup.
	AuditDedupWindowSec int
	// AuditForceRegex allows forcing audit for requests whose path matches this regex (optional).
	AuditForceRegex string

	// OIDC configuration (optional)
	OIDCEnabled       bool
	OIDCIssuer        string
	OIDCClientID      string
	OIDCClientSecret  string
	OIDCScopes        string // space-separated scopes, default: "openid profile email"
	OIDCRoleClaim     string // claim to extract roles from, e.g., "roles" or "realm_access.roles"
	OIDCUsernameClaim string // preferred_username, email, or sub

	// CORS configuration
	// CORSAllowedOrigins is the explicit allowlist of browser origins permitted for cross-origin requests.
	CORSAllowedOrigins []string

	// Trusted proxy configuration
	// TrustedProxies contains the IPs/CIDRs whose forwarded headers may be trusted.
	TrustedProxies []string
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
		JWTSecret:                   getEnv("REACT_APP_JWT_SECRET", "nauthilus-ui-default-secret-key-change-in-production"),
		TokenExpiry:                 getEnvAsInt("REACT_APP_TOKEN_EXPIRY", 3600),
		RefreshTokenExpiry:          getEnvAsInt("REACT_APP_REFRESH_TOKEN_EXPIRY", 86400),
		RememberMeExpiry:            getEnvAsInt("REACT_APP_REMEMBER_ME_EXPIRY", 86400),
		SyncRememberMeFromEnvOnBoot: getEnv("JWT_SYNC_FROM_ENV_ON_BOOT", "false") == "true",

		// Cookie banner configuration
		CookieBannerReshowDays: getEnvAsInt("REACT_APP_COOKIE_BANNER_RESHOW_DAYS", -1),

		// UI input limits
		RawJsonMaxBytes: getEnvAsInt("REACT_APP_RAW_JSON_MAX_BYTES", 8192),

		// WebAuthn configuration
		WebAuthnRPID:          getEnv("WEBAUTHN_RP_ID", ""),
		WebAuthnRPDisplayName: getEnv("WEBAUTHN_RP_DISPLAY_NAME", "Nauthilus UI"),

		// Audit log retention
		AuditRetentionDays:        getEnvAsInt("AUDIT_RETENTION_DAYS", 0),
		AuditCleanupIntervalHours: getEnvAsInt("AUDIT_CLEAN_INTERVAL_HOURS", 6),

		// Audit policy configuration
		AuditGetAudit:       getEnv("AUDIT_GET_AUDIT", "false") == "true",
		AuditDedupWindowSec: getEnvAsInt("AUDIT_DEDUP_WINDOW_SEC", 30),
		AuditForceRegex:     getEnv("AUDIT_FORCE_REGEX", ""),

		// OIDC configuration (optional)
		OIDCEnabled:       getEnv("REACT_APP_OIDC_ENABLED", "false") == "true",
		OIDCIssuer:        getEnv("REACT_APP_OIDC_ISSUER", ""),
		OIDCClientID:      getEnv("REACT_APP_OIDC_CLIENT_ID", ""),
		OIDCClientSecret:  getEnv("REACT_APP_OIDC_CLIENT_SECRET", ""),
		OIDCScopes:        getEnv("REACT_APP_OIDC_SCOPES", "openid profile email"),
		OIDCRoleClaim:     getEnv("REACT_APP_OIDC_ROLE_CLAIM", "roles"),
		OIDCUsernameClaim: getEnv("REACT_APP_OIDC_USERNAME_CLAIM", "preferred_username"),

		// CORS configuration
		CORSAllowedOrigins: getEnvAsCSV("CORS_ALLOWED_ORIGINS"),

		// Trusted proxy configuration
		TrustedProxies: getEnvAsCSV("TRUSTED_PROXIES"),
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

func getEnvAsCSV(key string) []string {
	raw := strings.TrimSpace(getEnv(key, ""))
	if raw == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}

		values = append(values, trimmed)
	}

	return values
}
