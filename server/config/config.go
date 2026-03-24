package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/go-viper/mapstructure/v2"
	"github.com/spf13/viper"
)

const (
	envPrefix = "NAUTHILUS_UI"
)

var defaultConfigSearchPaths = []string{
	".",
	"../",
	"/etc/nauthilus-ui",
	"/etc/nauthilus/ui",
}

// Config holds the complete application configuration.
// All values are loaded from YAML and can be overridden via environment variables
// using the NAUTHILUS_UI_* prefix.
type Config struct {
	Server       ServerConfig       `mapstructure:"server" validate:"required"`
	Database     DatabaseConfig     `mapstructure:"database" validate:"required"`
	Session      SessionConfig      `mapstructure:"session" validate:"required"`
	UI           UIConfig           `mapstructure:"ui" validate:"required"`
	Identity     IdentityConfig     `mapstructure:"identity" validate:"required"`
	Security     SecurityConfig     `mapstructure:"security" validate:"required"`
	Audit        AuditConfig        `mapstructure:"audit" validate:"required"`
	Integrations IntegrationsConfig `mapstructure:"integrations" validate:"required"`
}

// ServerConfig contains listener and proxy-related settings.
type ServerConfig struct {
	Frontend       ListenerConfig `mapstructure:"frontend" validate:"required"`
	Proxy          ProxyConfig    `mapstructure:"proxy" validate:"required"`
	TrustedProxies []string       `mapstructure:"trusted_proxies"`
}

// ListenerConfig defines a generic listening address.
type ListenerConfig struct {
	Address string `mapstructure:"address" validate:"required"`
	Port    int    `mapstructure:"port" validate:"required,min=1,max=65535"`
}

// ProxyConfig defines proxy listener and externally visible port for browser calls.
type ProxyConfig struct {
	Address    string `mapstructure:"address" validate:"required"`
	Port       int    `mapstructure:"port" validate:"required,min=1,max=65535"`
	PublicPort int    `mapstructure:"public_port" validate:"required,min=1,max=65535"`
}

// DatabaseConfig contains persistence related settings.
type DatabaseConfig struct {
	MongoDB MongoDBConfig `mapstructure:"mongodb" validate:"required"`
}

// MongoDBConfig contains MongoDB connection settings.
type MongoDBConfig struct {
	URI string `mapstructure:"uri" validate:"required"`
}

// SessionConfig contains server-side session behavior.
type SessionConfig struct {
	TokenExpirySeconds             int  `mapstructure:"token_expiry_seconds" validate:"required,min=1"`
	RefreshTokenExpirySeconds      int  `mapstructure:"refresh_token_expiry_seconds" validate:"required,min=1"`
	RememberMeExpirySeconds        int  `mapstructure:"remember_me_expiry_seconds" validate:"required,min=1"`
	SyncRememberMeFromConfigOnBoot bool `mapstructure:"sync_remember_me_from_config_on_boot"`
}

// UIConfig contains frontend runtime settings injected by the backend.
type UIConfig struct {
	CookieBannerReshowDays int `mapstructure:"cookie_banner_reshow_days" validate:"min=-1"`
	RawJSONMaxBytes        int `mapstructure:"raw_json_max_bytes" validate:"required,min=1024,max=1048576"`
}

// IdentityConfig contains identity-provider related settings.
type IdentityConfig struct {
	OIDC     OIDCConfig     `mapstructure:"oidc" validate:"required"`
	WebAuthn WebAuthnConfig `mapstructure:"webauthn" validate:"required"`
}

// OIDCConfig contains optional OIDC login settings.
type OIDCConfig struct {
	Enabled       bool   `mapstructure:"enabled"`
	Issuer        string `mapstructure:"issuer" validate:"omitempty,url"`
	ClientID      string `mapstructure:"client_id"`
	ClientSecret  string `mapstructure:"client_secret"`
	Scopes        string `mapstructure:"scopes" validate:"required"`
	RoleClaim     string `mapstructure:"role_claim" validate:"required"`
	UsernameClaim string `mapstructure:"username_claim" validate:"required"`
}

// WebAuthnConfig contains WebAuthn settings.
type WebAuthnConfig struct {
	RPID          string   `mapstructure:"rp_id" validate:"required"`
	RPDisplayName string   `mapstructure:"rp_display_name" validate:"required"`
	RPOrigins     []string `mapstructure:"rp_origins" validate:"required,min=1,dive,required"`
}

// SecurityConfig contains browser/API security toggles.
type SecurityConfig struct {
	CORS      CORSConfig      `mapstructure:"cors" validate:"required"`
	Recaptcha RecaptchaConfig `mapstructure:"recaptcha" validate:"required"`
}

// CORSConfig contains allowed browser origins.
type CORSConfig struct {
	AllowedOrigins []string `mapstructure:"allowed_origins"`
}

// RecaptchaConfig contains adaptive reCAPTCHA settings.
type RecaptchaConfig struct {
	Secret    string  `mapstructure:"secret"`
	SiteKey   string  `mapstructure:"site_key"`
	MinScore  float64 `mapstructure:"min_score" validate:"gte=0,lte=1"`
	Threshold int     `mapstructure:"threshold" validate:"required,min=1"`
}

// AuditConfig contains audit retention and dedup settings.
type AuditConfig struct {
	RetentionDays        int               `mapstructure:"retention_days" validate:"min=0"`
	CleanupIntervalHours int               `mapstructure:"cleanup_interval_hours" validate:"required,min=1"`
	Policy               AuditPolicyConfig `mapstructure:"policy" validate:"required"`
}

// AuditPolicyConfig contains request-level audit policy settings.
type AuditPolicyConfig struct {
	IncludeGetRequests bool   `mapstructure:"include_get_requests"`
	DedupWindowSeconds int    `mapstructure:"dedup_window_seconds" validate:"min=0"`
	ForcePathRegex     string `mapstructure:"force_path_regex"`
}

// IntegrationsConfig contains optional external integrations.
type IntegrationsConfig struct {
	IPAPI  IPAPIConfig  `mapstructure:"ipapi" validate:"required"`
	Report ReportConfig `mapstructure:"report" validate:"required"`
}

// IPAPIConfig contains ipapi.com integration settings.
type IPAPIConfig struct {
	APIKey string `mapstructure:"api_key"`
}

// ReportConfig contains PDF/report generation settings.
type ReportConfig struct {
	ChromePath string `mapstructure:"chrome_path"`
}

// LoadConfig loads application configuration from YAML and environment overrides.
func LoadConfig() (*Config, error) {
	v := viper.New()
	configureDefaults(v)
	configureEnvironment(v)

	explicitConfigPath := firstNonEmpty(
		parseConfigPathFromArgs(os.Args[1:]),
		strings.TrimSpace(os.Getenv(envPrefix+"_CONFIG_FILE")),
	)

	if explicitConfigPath != "" {
		v.SetConfigFile(explicitConfigPath)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")

		for _, searchPath := range defaultConfigSearchPaths {
			v.AddConfigPath(searchPath)
		}
	}

	if err := v.ReadInConfig(); err != nil {
		var notFoundErr viper.ConfigFileNotFoundError
		if explicitConfigPath != "" || !errors.As(err, &notFoundErr) {
			return nil, fmt.Errorf("failed to read config: %w", err)
		}
	}

	cfg := &Config{}
	if err := v.UnmarshalExact(cfg, viper.DecodeHook(mapstructure.ComposeDecodeHookFunc(
		mapstructure.StringToSliceHookFunc(","),
	))); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	cfg.normalize()

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Validate validates all configuration parameters.
func (c *Config) Validate() error {
	if c == nil {
		return errors.New("config is nil")
	}

	validate := validator.New()
	if err := validate.Struct(c); err != nil {
		return fmt.Errorf("config validation failed: %w", err)
	}

	if !strings.HasPrefix(c.Database.MongoDB.URI, "mongodb://") && !strings.HasPrefix(c.Database.MongoDB.URI, "mongodb+srv://") {
		return errors.New("database.mongodb.uri must start with mongodb:// or mongodb+srv://")
	}

	if c.Identity.OIDC.Enabled {
		if strings.TrimSpace(c.Identity.OIDC.Issuer) == "" {
			return errors.New("identity.oidc.issuer is required when identity.oidc.enabled=true")
		}

		if strings.TrimSpace(c.Identity.OIDC.ClientID) == "" {
			return errors.New("identity.oidc.client_id is required when identity.oidc.enabled=true")
		}
	}

	if err := validateOriginList(c.Security.CORS.AllowedOrigins, "security.cors.allowed_origins"); err != nil {
		return err
	}

	if err := validateOriginList(c.Identity.WebAuthn.RPOrigins, "identity.webauthn.rp_origins"); err != nil {
		return err
	}

	if c.Audit.Policy.ForcePathRegex != "" {
		if _, err := regexp.Compile(c.Audit.Policy.ForcePathRegex); err != nil {
			return fmt.Errorf("audit.policy.force_path_regex is invalid: %w", err)
		}
	}

	hasRecaptchaSecret := strings.TrimSpace(c.Security.Recaptcha.Secret) != ""
	hasRecaptchaSiteKey := strings.TrimSpace(c.Security.Recaptcha.SiteKey) != ""

	if hasRecaptchaSecret != hasRecaptchaSiteKey {
		return errors.New("security.recaptcha.secret and security.recaptcha.site_key must either both be set or both be empty")
	}

	return nil
}

func (c *Config) normalize() {
	if c == nil {
		return
	}

	c.Server.TrustedProxies = normalizeStringSlice(c.Server.TrustedProxies)
	c.Security.CORS.AllowedOrigins = normalizeStringSlice(c.Security.CORS.AllowedOrigins)
	c.Identity.WebAuthn.RPOrigins = normalizeStringSlice(c.Identity.WebAuthn.RPOrigins)

	if c.Server.Proxy.PublicPort == 0 {
		c.Server.Proxy.PublicPort = c.Server.Proxy.Port
	}

	if strings.TrimSpace(c.Identity.WebAuthn.RPID) == "" {
		frontendAddress := strings.TrimSpace(c.Server.Frontend.Address)
		switch frontendAddress {
		case "", "0.0.0.0", "::":
			c.Identity.WebAuthn.RPID = "localhost"
		default:
			c.Identity.WebAuthn.RPID = frontendAddress
		}
	}

	if len(c.Identity.WebAuthn.RPOrigins) == 0 {
		if c.Identity.WebAuthn.RPID == "localhost" {
			c.Identity.WebAuthn.RPOrigins = []string{
				"http://localhost:3000",
				fmt.Sprintf("http://localhost:%d", c.Server.Frontend.Port),
			}
		} else {
			c.Identity.WebAuthn.RPOrigins = []string{"https://" + c.Identity.WebAuthn.RPID}
		}
	}
}

func configureDefaults(v *viper.Viper) {
	defaults := map[string]any{
		"server.frontend.address":  "0.0.0.0",
		"server.frontend.port":     3001,
		"server.proxy.address":     "0.0.0.0",
		"server.proxy.port":        3002,
		"server.proxy.public_port": 3002,
		"server.trusted_proxies":   []string{},

		"database.mongodb.uri": "mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin",

		"session.token_expiry_seconds":                 3600,
		"session.refresh_token_expiry_seconds":         86400,
		"session.remember_me_expiry_seconds":           86400,
		"session.sync_remember_me_from_config_on_boot": false,

		"ui.cookie_banner_reshow_days": -1,
		"ui.raw_json_max_bytes":        8192,

		"identity.oidc.enabled":        false,
		"identity.oidc.issuer":         "",
		"identity.oidc.client_id":      "",
		"identity.oidc.client_secret":  "",
		"identity.oidc.scopes":         "openid profile email",
		"identity.oidc.role_claim":     "roles",
		"identity.oidc.username_claim": "preferred_username",

		"identity.webauthn.rp_id":           "",
		"identity.webauthn.rp_display_name": "Nauthilus UI",
		"identity.webauthn.rp_origins":      []string{},

		"security.cors.allowed_origins": []string{},
		"security.recaptcha.secret":     "",
		"security.recaptcha.site_key":   "",
		"security.recaptcha.min_score":  0.0,
		"security.recaptcha.threshold":  3,

		"audit.retention_days":              0,
		"audit.cleanup_interval_hours":      6,
		"audit.policy.include_get_requests": false,
		"audit.policy.dedup_window_seconds": 30,
		"audit.policy.force_path_regex":     "",

		"integrations.ipapi.api_key":      "",
		"integrations.report.chrome_path": "",
	}

	for key, value := range defaults {
		v.SetDefault(key, value)
	}
}

func configureEnvironment(v *viper.Viper) {
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	keys := []string{
		"server.frontend.address",
		"server.frontend.port",
		"server.proxy.address",
		"server.proxy.port",
		"server.proxy.public_port",
		"server.trusted_proxies",
		"database.mongodb.uri",
		"session.token_expiry_seconds",
		"session.refresh_token_expiry_seconds",
		"session.remember_me_expiry_seconds",
		"session.sync_remember_me_from_config_on_boot",
		"ui.cookie_banner_reshow_days",
		"ui.raw_json_max_bytes",
		"identity.oidc.enabled",
		"identity.oidc.issuer",
		"identity.oidc.client_id",
		"identity.oidc.client_secret",
		"identity.oidc.scopes",
		"identity.oidc.role_claim",
		"identity.oidc.username_claim",
		"identity.webauthn.rp_id",
		"identity.webauthn.rp_display_name",
		"identity.webauthn.rp_origins",
		"security.cors.allowed_origins",
		"security.recaptcha.secret",
		"security.recaptcha.site_key",
		"security.recaptcha.min_score",
		"security.recaptcha.threshold",
		"audit.retention_days",
		"audit.cleanup_interval_hours",
		"audit.policy.include_get_requests",
		"audit.policy.dedup_window_seconds",
		"audit.policy.force_path_regex",
		"integrations.ipapi.api_key",
		"integrations.report.chrome_path",
	}

	for _, key := range keys {
		_ = v.BindEnv(key)
	}
}

func parseConfigPathFromArgs(args []string) string {
	for i := 0; i < len(args); i++ {
		arg := strings.TrimSpace(args[i])
		if arg == "" {
			continue
		}

		if arg == "--config" || arg == "-c" {
			if i+1 < len(args) {
				return strings.TrimSpace(args[i+1])
			}

			continue
		}

		if strings.HasPrefix(arg, "--config=") {
			return strings.TrimSpace(strings.TrimPrefix(arg, "--config="))
		}

		if strings.HasPrefix(arg, "-c=") {
			return strings.TrimSpace(strings.TrimPrefix(arg, "-c="))
		}
	}

	return ""
}

func validateOriginList(origins []string, fieldName string) error {
	for _, raw := range origins {
		parsed, err := url.Parse(raw)
		if err != nil {
			return fmt.Errorf("%s contains invalid origin %q: %w", fieldName, raw, err)
		}

		if parsed.Scheme == "" || parsed.Host == "" {
			return fmt.Errorf("%s contains invalid origin %q: scheme and host are required", fieldName, raw)
		}

		if parsed.RawQuery != "" || parsed.Fragment != "" {
			return fmt.Errorf("%s contains invalid origin %q: query and fragment are not allowed", fieldName, raw)
		}

		if parsed.Path != "" && parsed.Path != "/" {
			return fmt.Errorf("%s contains invalid origin %q: path is not allowed", fieldName, raw)
		}
	}

	return nil
}

func normalizeStringSlice(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))

	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}

		if _, exists := seen[trimmed]; exists {
			continue
		}

		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	if len(normalized) == 0 {
		return nil
	}

	return normalized
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}

	return ""
}
