package config

import (
	"os"
	"path/filepath"
	"runtime"
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

	if cfg.Identity.WebAuthn.RPID != "127.0.0.1" {
		t.Fatalf("expected derived WebAuthn rp_id 127.0.0.1, got %q", cfg.Identity.WebAuthn.RPID)
	}

	if len(cfg.Identity.WebAuthn.RPOrigins) != 1 || cfg.Identity.WebAuthn.RPOrigins[0] != "https://127.0.0.1" {
		t.Fatalf("expected derived WebAuthn origins [https://127.0.0.1], got %+v", cfg.Identity.WebAuthn.RPOrigins)
	}

	if cfg.Profiles.MaxVersionsPerProfile != 50 {
		t.Fatalf("expected default profiles.max_versions_per_profile to be 50, got %d", cfg.Profiles.MaxVersionsPerProfile)
	}
}

func TestLoadConfigAppliesEnvOverridesWithPrefix(t *testing.T) {
	path := writeTempConfigFile(t, `
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)
	t.Setenv(envPrefix+"_SERVER_FRONTEND_PORT", "8443")
	t.Setenv(envPrefix+"_SECURITY_CORS_ALLOWED_ORIGINS", "https://ui.example.com,https://admin.example.com")
	t.Setenv(envPrefix+"_IDENTITY_OIDC_ENABLED", "true")
	t.Setenv(envPrefix+"_IDENTITY_OIDC_ISSUER", "https://id.example.com/realms/ui")
	t.Setenv(envPrefix+"_IDENTITY_OIDC_CLIENT_ID", "ui-client")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.Server.Frontend.Port != 8443 {
		t.Fatalf("expected frontend port 8443, got %d", cfg.Server.Frontend.Port)
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

func TestLoadConfigRejectsRelativeGitSSHPaths(t *testing.T) {
	path := writeTempConfigFile(t, `
integrations:
  git:
    ssh:
      users:
        - username: "alice"
          ssh_user: "git"
          private_key_path: "relative/key"
          known_hosts_path: "/etc/nauthilus-ui/ssh/known_hosts"
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected LoadConfig to reject relative git private key path")
	}

	if !strings.Contains(err.Error(), "private_key_path must be an absolute path") {
		t.Fatalf("expected private_key_path validation error, got %v", err)
	}
}

func TestLoadConfigRejectsDuplicateGitSSHUsernames(t *testing.T) {
	path := writeTempConfigFile(t, `
integrations:
  git:
    ssh:
      users:
        - username: "alice"
          ssh_user: "git"
          private_key_path: "/etc/nauthilus-ui/ssh/alice"
          known_hosts_path: "/etc/nauthilus-ui/ssh/known_hosts"
        - username: "alice"
          ssh_user: "git"
          private_key_path: "/etc/nauthilus-ui/ssh/alice-second"
          known_hosts_path: "/etc/nauthilus-ui/ssh/known_hosts"
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected LoadConfig to reject duplicate git ssh usernames")
	}

	if !strings.Contains(err.Error(), "duplicate username") {
		t.Fatalf("expected duplicate username validation error, got %v", err)
	}
}

func TestLoadConfigRejectsRelativeRuntimeSSHPaths(t *testing.T) {
	path := writeTempConfigFile(t, `
integrations:
  runtime:
    ssh:
      users:
        - username: "alice"
          ssh_user: "ops"
          private_key_path: "relative/runtime-key"
          known_hosts_path: "/etc/nauthilus-ui/ssh/runtime-known_hosts"
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected LoadConfig to reject relative runtime private key path")
	}

	if !strings.Contains(err.Error(), "private_key_path must be an absolute path") {
		t.Fatalf("expected private_key_path validation error, got %v", err)
	}
}

func TestLoadConfigRejectsDuplicateRuntimeSSHUsernames(t *testing.T) {
	path := writeTempConfigFile(t, `
integrations:
  runtime:
    ssh:
      users:
        - username: "alice"
          ssh_user: "ops"
          private_key_path: "/etc/nauthilus-ui/ssh/runtime-alice"
          known_hosts_path: "/etc/nauthilus-ui/ssh/runtime-known_hosts"
        - username: "alice"
          ssh_user: "ops"
          private_key_path: "/etc/nauthilus-ui/ssh/runtime-alice-secondary"
          known_hosts_path: "/etc/nauthilus-ui/ssh/runtime-known_hosts"
database:
  mongodb:
    uri: mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
`)

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("expected LoadConfig to reject duplicate runtime ssh usernames")
	}

	if !strings.Contains(err.Error(), "duplicate username") {
		t.Fatalf("expected duplicate username validation error, got %v", err)
	}
}

func TestLoadConfigLoadsDemoStackConfig(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	path := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..", "contrib", "demo-stack", "nauthilus-ui", "config.yaml"))
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("demo stack config is not accessible at %s: %v", path, err)
	}

	t.Setenv(envPrefix+"_CONFIG_FILE", path)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned error for demo stack config: %v", err)
	}

	if cfg.Server.Frontend.Port != 3001 {
		t.Fatalf("expected demo frontend port 3001, got %d", cfg.Server.Frontend.Port)
	}
}
