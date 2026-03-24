package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTempConfigFile(t *testing.T, content string) string {
	t.Helper()

	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("os.WriteFile returned error: %v", err)
	}

	return path
}

func TestLoadConfigLoadsYAMLAndDerivedDefaults(t *testing.T) {
	path := writeTempConfigFile(t, `
server:
  frontend:
    address: 127.0.0.1
    port: 3101
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.Server.Frontend.Port != 3101 {
		t.Fatalf("expected frontend port 3101, got %d", cfg.Server.Frontend.Port)
	}

	if cfg.Server.Proxy.Port != 3002 {
		t.Fatalf("expected default proxy port 3002, got %d", cfg.Server.Proxy.Port)
	}

	if cfg.Server.Proxy.PublicPort != 3002 {
		t.Fatalf("expected default proxy public port 3002, got %d", cfg.Server.Proxy.PublicPort)
	}

	if cfg.Identity.WebAuthn.RPID != "127.0.0.1" {
		t.Fatalf("expected derived WebAuthn rp_id 127.0.0.1, got %q", cfg.Identity.WebAuthn.RPID)
	}

	if len(cfg.Identity.WebAuthn.RPOrigins) != 1 || cfg.Identity.WebAuthn.RPOrigins[0] != "https://127.0.0.1" {
		t.Fatalf("expected derived WebAuthn origins [https://127.0.0.1], got %+v", cfg.Identity.WebAuthn.RPOrigins)
	}
}

func TestLoadConfigAppliesEnvOverridesWithPrefix(t *testing.T) {
	path := writeTempConfigFile(t, `
server:
  proxy:
    public_port: 3002
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)
	t.Setenv(envPrefix+"_SERVER_PROXY_PUBLIC_PORT", "8443")
	t.Setenv(envPrefix+"_SECURITY_CORS_ALLOWED_ORIGINS", "https://ui.example.com,https://admin.example.com")
	t.Setenv(envPrefix+"_IDENTITY_OIDC_ENABLED", "true")
	t.Setenv(envPrefix+"_IDENTITY_OIDC_ISSUER", "https://id.example.com/realms/ui")
	t.Setenv(envPrefix+"_IDENTITY_OIDC_CLIENT_ID", "ui-client")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.Server.Proxy.PublicPort != 8443 {
		t.Fatalf("expected proxy public port 8443, got %d", cfg.Server.Proxy.PublicPort)
	}

	if len(cfg.Security.CORS.AllowedOrigins) != 2 {
		t.Fatalf("expected 2 CORS origins from env, got %+v", cfg.Security.CORS.AllowedOrigins)
	}

	if cfg.Security.CORS.AllowedOrigins[0] != "https://ui.example.com" || cfg.Security.CORS.AllowedOrigins[1] != "https://admin.example.com" {
		t.Fatalf("unexpected CORS origins from env: %+v", cfg.Security.CORS.AllowedOrigins)
	}

	if !cfg.Identity.OIDC.Enabled {
		t.Fatal("expected OIDC to be enabled via env override")
	}
}

func TestLoadConfigRejectsInvalidAuditRegex(t *testing.T) {
	path := writeTempConfigFile(t, `
audit:
  policy:
    force_path_regex: "["
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected LoadConfig to fail for invalid audit regex")
	}

	if !strings.Contains(err.Error(), "audit.policy.force_path_regex") {
		t.Fatalf("expected regex validation error, got %v", err)
	}
}
