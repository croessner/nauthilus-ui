package sshprovider

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writeSSHFixtureFiles(t *testing.T, privateKeyPerm os.FileMode) (string, string) {
	t.Helper()

	dir := t.TempDir()
	privateKeyPath := filepath.Join(dir, "id_ed25519")
	knownHostsPath := filepath.Join(dir, "known_hosts")

	if err := os.WriteFile(privateKeyPath, []byte("dummy-private-key"), privateKeyPerm); err != nil {
		t.Fatalf("failed to write private key fixture: %v", err)
	}

	if err := os.WriteFile(knownHostsPath, []byte("git.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDummy\n"), 0o600); err != nil {
		t.Fatalf("failed to write known_hosts fixture: %v", err)
	}

	return privateKeyPath, knownHostsPath
}

func TestProviderHasUserAndPassphraseCacheSeconds(t *testing.T) {
	provider := NewProvider(120, []UserMapping{{
		Username:       "alice",
		SSHUser:        "git",
		PrivateKeyPath: "/tmp/id_ed25519",
		KnownHostsPath: "/tmp/known_hosts",
	}})

	if !provider.HasUser("alice") {
		t.Fatal("expected provider to have mapping for alice")
	}

	if provider.HasUser("bob") {
		t.Fatal("expected provider not to have mapping for bob")
	}

	if got := provider.PassphraseCacheSeconds(); got != 120 {
		t.Fatalf("expected passphrase cache ttl 120, got %d", got)
	}
}

func TestResolveUserRejectsUnknownUser(t *testing.T) {
	provider := NewProvider(-1, nil)

	_, err := provider.ResolveUser("alice")
	if !errors.Is(err, ErrUserNotMapped) {
		t.Fatalf("expected ErrUserNotMapped, got %v", err)
	}
}

func TestPrepareGitEnvironmentBuildsEphemeralScripts(t *testing.T) {
	privateKeyPath, knownHostsPath := writeSSHFixtureFiles(t, 0o600)

	provider := NewProvider(-1, []UserMapping{{
		Username:       "alice",
		SSHUser:        "git",
		PrivateKeyPath: privateKeyPath,
		KnownHostsPath: knownHostsPath,
	}})

	env, cleanup, err := provider.PrepareGitEnvironment("alice", "pass123")
	if err != nil {
		t.Fatalf("expected PrepareGitEnvironment success, got %v", err)
	}
	if cleanup == nil {
		t.Fatal("expected cleanup callback")
	}
	defer cleanup()

	contains := func(prefix string) bool {
		for _, item := range env {
			if strings.HasPrefix(item, prefix) {
				return true
			}
		}

		return false
	}

	if !contains("GIT_SSH_COMMAND=") {
		t.Fatalf("expected GIT_SSH_COMMAND in env, got %v", env)
	}

	if !contains("SSH_ASKPASS=") {
		t.Fatalf("expected SSH_ASKPASS in env, got %v", env)
	}

	if !contains("NAUTHILUS_UI_SSH_PASSPHRASE=pass123") {
		t.Fatalf("expected passphrase env in env, got %v", env)
	}
}

func TestResolveUserRejectsInsecurePrivateKeyPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission model differs on windows")
	}

	privateKeyPath, knownHostsPath := writeSSHFixtureFiles(t, 0o644)

	provider := NewProvider(-1, []UserMapping{{
		Username:       "alice",
		SSHUser:        "git",
		PrivateKeyPath: privateKeyPath,
		KnownHostsPath: knownHostsPath,
	}})

	_, err := provider.ResolveUser("alice")
	if !errors.Is(err, ErrInsecurePrivateKeyPermissions) {
		t.Fatalf("expected ErrInsecurePrivateKeyPermissions, got %v", err)
	}
}

func TestClassifySSHCommandError(t *testing.T) {
	if !errors.Is(classifySSHCommandError(errors.New("exit status 255"), "Enter passphrase for key '/tmp/id_ed25519':"), ErrPassphraseRequired) {
		t.Fatal("expected passphrase-required classification")
	}

	if !errors.Is(classifySSHCommandError(errors.New("exit status 255"), "Load key '/tmp/id_ed25519': incorrect passphrase supplied"), ErrInvalidPassphrase) {
		t.Fatal("expected invalid-passphrase classification")
	}
}
