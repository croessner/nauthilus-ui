package gitops

import (
	"errors"
	"testing"

	"nauthilus-ui/server/integrations/sshprovider"
)

func TestCapabilitiesForUser(t *testing.T) {
	provider := sshprovider.NewProvider(300, []sshprovider.UserMapping{{
		Username:       "alice",
		SSHUser:        "git",
		PrivateKeyPath: "/tmp/id_ed25519",
		KnownHostsPath: "/tmp/known_hosts",
	}})

	service := NewService(Settings{
		Enabled:         true,
		DefaultBranch:   "main",
		DefaultFilePath: "nauthilus.yml",
	}, provider)

	caps := service.CapabilitiesForUser("alice")
	if !caps.Enabled {
		t.Fatal("expected git integration to be enabled")
	}
	if !caps.SSHAvailable {
		t.Fatal("expected ssh to be available for alice")
	}
	if caps.PassphraseCacheSeconds != 300 {
		t.Fatalf("expected passphrase cache seconds 300, got %d", caps.PassphraseCacheSeconds)
	}
}

func TestNormalizeRepositoryURLHTTPS(t *testing.T) {
	auth := AuthOptions{UseSSH: false, Username: "alice", Password: "secret"}
	resolved, err := normalizeRepositoryURL("https://git.example.com/org/repo.git", auth)
	if err != nil {
		t.Fatalf("expected valid https repository url, got %v", err)
	}

	if resolved == "https://git.example.com/org/repo.git" {
		t.Fatal("expected credentials to be injected into remote url")
	}
}

func TestNormalizeRepositoryURLRejectsMissingHTTPSCredentials(t *testing.T) {
	_, err := normalizeRepositoryURL("https://git.example.com/org/repo.git", AuthOptions{})
	if !errors.Is(err, ErrMissingHTTPSCredentials) {
		t.Fatalf("expected ErrMissingHTTPSCredentials, got %v", err)
	}
}

func TestNormalizeRepositoryURLSSH(t *testing.T) {
	if _, err := normalizeRepositoryURL("git@git.example.com:org/repo.git", AuthOptions{UseSSH: true}); err != nil {
		t.Fatalf("expected valid scp-style ssh url, got %v", err)
	}

	if _, err := normalizeRepositoryURL("ssh://git@git.example.com/org/repo.git", AuthOptions{UseSSH: true}); err != nil {
		t.Fatalf("expected valid ssh:// url, got %v", err)
	}
}

func TestNormalizeRepositoryFilePathRejectsTraversal(t *testing.T) {
	if _, err := normalizeRepositoryFilePath("../secret.yml", "nauthilus.yml"); !errors.Is(err, ErrInvalidFilePath) {
		t.Fatalf("expected ErrInvalidFilePath for traversal, got %v", err)
	}
}

func TestResolveAndValidateRequestRequiresSSHMapping(t *testing.T) {
	service := NewService(Settings{
		Enabled:         true,
		DefaultBranch:   "main",
		DefaultFilePath: "nauthilus.yml",
	}, nil)

	_, err := service.resolveAndValidateRequest("alice", "git@git.example.com:org/repo.git", "main", "nauthilus.yml", AuthOptions{UseSSH: true})
	if !errors.Is(err, sshprovider.ErrUserNotMapped) {
		t.Fatalf("expected sshprovider.ErrUserNotMapped, got %v", err)
	}
}

func TestSanitizeCommitIdentity(t *testing.T) {
	if got := sanitizeCommitIdentity(" Alice Admin "); got != "Alice-Admin" {
		t.Fatalf("expected sanitized identity Alice-Admin, got %q", got)
	}

	if got := sanitizeCommitIdentity("@@@"); got != "nauthilus-ui" {
		t.Fatalf("expected fallback identity nauthilus-ui, got %q", got)
	}
}
