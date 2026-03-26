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

func TestNormalizeTagName(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "empty is allowed", input: "", want: "", wantErr: false},
		{name: "semver style", input: "v1.2.3", want: "v1.2.3", wantErr: false},
		{name: "folder style", input: "release/2026-03-26", want: "release/2026-03-26", wantErr: false},
		{name: "contains space", input: "release candidate", wantErr: true},
		{name: "starts with dash", input: "-bad", wantErr: true},
		{name: "contains traversal marker", input: "v1..2", wantErr: true},
		{name: "contains forbidden sequence", input: "v1@{bad}", wantErr: true},
		{name: "contains lock suffix", input: "refs.lock", wantErr: true},
		{name: "contains wildcard", input: "release/*", wantErr: true},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := normalizeTagName(tc.input)
			if tc.wantErr {
				if !errors.Is(err, ErrInvalidTag) {
					t.Fatalf("expected ErrInvalidTag, got %v", err)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestClassifyGitCommandError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want error
	}{
		{
			name: "unreachable host",
			in:   "ssh: connect to host localhost port 2222: Connection refused",
			want: ErrRepositoryUnreachable,
		},
		{
			name: "auth failed",
			in:   "Permission denied (publickey).",
			want: ErrRepositoryAuthFailed,
		},
		{
			name: "not found",
			in:   "remote: Repository not found.",
			want: ErrRepositoryNotFound,
		},
		{
			name: "host key verification failed",
			in:   "Host key verification failed.",
			want: ErrSSHHostKeyVerificationFailed,
		},
		{
			name: "unknown",
			in:   "fatal: some unknown error",
			want: nil,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := classifyGitCommandError(tc.in)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("expected nil classification, got %v", got)
				}

				return
			}

			if !errors.Is(got, tc.want) {
				t.Fatalf("expected %v, got %v", tc.want, got)
			}
		})
	}
}
