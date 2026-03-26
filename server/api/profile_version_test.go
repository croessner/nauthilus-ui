package api

import (
	"strings"
	"testing"

	"nauthilus-ui/server/models"
)

func TestSanitizeProfileVersionSource(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "manual", in: "manual", want: profileVersionSourceManual},
		{name: "restore", in: "restore", want: profileVersionSourceRestore},
		{name: "git pull", in: "git_pull", want: profileVersionSourceGitPull},
		{name: "unknown defaults to auto", in: "custom", want: profileVersionSourceAuto},
		{name: "empty defaults to auto", in: "", want: profileVersionSourceAuto},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := sanitizeProfileVersionSource(tc.in)
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestDetectChangedProfilesTreatsNumericTypesAsEqual(t *testing.T) {
	t.Parallel()

	previous := []models.ProfileData{
		{
			Name: "Default",
			Config: map[string]interface{}{
				"server": map[string]interface{}{
					"max_concurrent_requests": int64(100),
				},
			},
		},
	}

	next := []models.ProfileData{
		{
			Name: "Default",
			Config: map[string]interface{}{
				"server": map[string]interface{}{
					"max_concurrent_requests": float64(100),
				},
			},
		},
	}

	changed := detectChangedProfiles(previous, next)
	if len(changed) != 0 {
		t.Fatalf("expected no changed profiles, got %+v", changed)
	}
}

func TestDetectRenamedProfiles(t *testing.T) {
	t.Parallel()

	previous := []models.ProfileData{
		{Name: "OldProfile", Config: map[string]interface{}{"server": map[string]interface{}{"address": "127.0.0.1:8080"}}},
	}

	next := []models.ProfileData{
		{Name: "NewProfile", Config: map[string]interface{}{"server": map[string]interface{}{"address": "127.0.0.1:8080"}}},
	}

	renamed := detectRenamedProfiles(previous, next)
	if got := renamed["OldProfile"]; got != "NewProfile" {
		t.Fatalf("expected OldProfile -> NewProfile rename mapping, got %+v", renamed)
	}
}

func TestSanitizeProfileVersionMetadataRedactsGitRepositoryURL(t *testing.T) {
	t.Parallel()

	metadata := map[string]interface{}{
		"repositoryUrl": "https://alice:supersecret@example.com/repo.git?token=abc123&branch=main",
		"branch":        "main",
	}

	sanitized := sanitizeProfileVersionMetadata(profileVersionSourceGitPull, metadata)
	rawURL, _ := sanitized["repositoryUrl"].(string)
	if rawURL == "" {
		t.Fatal("expected repositoryUrl to be present after sanitization")
	}

	if strings.Contains(rawURL, "supersecret") || strings.Contains(rawURL, "alice@") {
		t.Fatalf("expected repository credentials to be redacted, got %q", rawURL)
	}

	if !strings.Contains(rawURL, "%5BREDACTED%5D") && !strings.Contains(rawURL, "[REDACTED]") {
		t.Fatalf("expected sensitive query data to be redacted, got %q", rawURL)
	}
}
