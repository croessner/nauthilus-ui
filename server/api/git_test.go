package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/integrations/gitops"
	"nauthilus-ui/server/integrations/sshprovider"
	"nauthilus-ui/server/models"
)

func TestMapGitError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{name: "integration disabled", err: gitops.ErrIntegrationDisabled, wantStatus: http.StatusForbidden, wantCode: "git_integration_disabled"},
		{name: "invalid repository", err: gitops.ErrInvalidRepositoryURL, wantStatus: http.StatusBadRequest, wantCode: "git_invalid_repository_url"},
		{name: "invalid tag", err: gitops.ErrInvalidTag, wantStatus: http.StatusBadRequest, wantCode: "git_invalid_tag"},
		{name: "missing https credentials", err: gitops.ErrMissingHTTPSCredentials, wantStatus: http.StatusBadRequest, wantCode: "git_missing_https_credentials"},
		{name: "repository unreachable", err: gitops.ErrRepositoryUnreachable, wantStatus: http.StatusBadRequest, wantCode: "git_repository_unreachable"},
		{name: "repository auth failed", err: gitops.ErrRepositoryAuthFailed, wantStatus: http.StatusBadRequest, wantCode: "git_repository_auth_failed"},
		{name: "repository not found", err: gitops.ErrRepositoryNotFound, wantStatus: http.StatusNotFound, wantCode: "git_repository_not_found"},
		{name: "host key verification failed", err: gitops.ErrSSHHostKeyVerificationFailed, wantStatus: http.StatusBadRequest, wantCode: "git_ssh_host_key_verification_failed"},
		{name: "ssh mapping missing", err: sshprovider.ErrUserNotMapped, wantStatus: http.StatusForbidden, wantCode: "ssh_mapping_missing"},
		{name: "ssh passphrase required", err: sshprovider.ErrPassphraseRequired, wantStatus: http.StatusBadRequest, wantCode: "ssh_passphrase_required"},
		{name: "fallback", err: errors.New("boom"), wantStatus: http.StatusInternalServerError, wantCode: "git_operation_failed"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			status, code, message := mapGitError(tc.err)
			if status != tc.wantStatus {
				t.Fatalf("expected status %d, got %d", tc.wantStatus, status)
			}
			if code != tc.wantCode {
				t.Fatalf("expected code %q, got %q", tc.wantCode, code)
			}
			if message == "" {
				t.Fatal("expected non-empty message")
			}
		})
	}
}

func TestNormalizeGitSettingsPayloadTrimsAndLimits(t *testing.T) {
	t.Parallel()

	longRepository := strings.Repeat("x", maxGitRepositoryURLLength+50)
	longBranch := strings.Repeat("b", maxGitBranchLength+10)
	longPath := strings.Repeat("p", maxGitFilePathLength+10)
	longTag := strings.Repeat("t", maxGitTagLength+10)
	longUsername := strings.Repeat("u", maxGitUsernameLength+10)

	got := normalizeGitSettingsPayload(gitSettingsRequest{
		RepositoryURL: "  " + longRepository + "  ",
		Branch:        "  " + longBranch + "  ",
		FilePath:      "  " + longPath + "  ",
		TagName:       "  " + longTag + "  ",
		UseSSH:        true,
		HTTPSUsername: "  " + longUsername + "  ",
	})

	if len(got.RepositoryURL) != maxGitRepositoryURLLength {
		t.Fatalf("expected repositoryUrl length %d, got %d", maxGitRepositoryURLLength, len(got.RepositoryURL))
	}
	if len(got.Branch) != maxGitBranchLength {
		t.Fatalf("expected branch length %d, got %d", maxGitBranchLength, len(got.Branch))
	}
	if len(got.FilePath) != maxGitFilePathLength {
		t.Fatalf("expected filePath length %d, got %d", maxGitFilePathLength, len(got.FilePath))
	}
	if len(got.TagName) != maxGitTagLength {
		t.Fatalf("expected tagName length %d, got %d", maxGitTagLength, len(got.TagName))
	}
	if len(got.HTTPSUsername) != maxGitUsernameLength {
		t.Fatalf("expected httpsUsername length %d, got %d", maxGitUsernameLength, len(got.HTTPSUsername))
	}
	if !got.UseSSH {
		t.Fatal("expected useSsh to stay true")
	}
}

func TestResolveGitSettingsProfileName(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)

	t.Run("rejects missing profile", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = []gin.Param{{Key: "profileName", Value: "   "}}

		_, ok := resolveGitSettingsProfileName(ctx)
		if ok {
			t.Fatal("expected resolveGitSettingsProfileName to reject blank profile")
		}
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", recorder.Code)
		}
	})

	t.Run("returns trimmed profile", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Params = []gin.Param{{Key: "profileName", Value: "  Main Profile  "}}

		profileName, ok := resolveGitSettingsProfileName(ctx)
		if !ok {
			t.Fatal("expected profile to be accepted")
		}
		if profileName != "Main Profile" {
			t.Fatalf("expected trimmed profile name, got %q", profileName)
		}
	})
}

func TestSaveGitSettingsWithoutDatabaseReturnsSanitizedPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewGitHandler(nil, &db.MongoDB{IsConnected: false})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/git/settings/default",
		strings.NewReader(`{
			"repositoryUrl": "  https://example.com/org/repo.git  ",
			"branch": "  main  ",
			"filePath": "  nauthilus.yml  ",
			"tagName": "  v1.0.0  ",
			"useSsh": true,
			"httpsUsername": "  alice  ",
			"password": "must-not-be-persisted"
		}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("username", "alice")
	ctx.Params = []gin.Param{{Key: "profileName", Value: "default"}}

	handler.SaveSettings(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var payload models.GitSettingsResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if payload.RepositoryURL != "https://example.com/org/repo.git" {
		t.Fatalf("expected trimmed repositoryUrl, got %q", payload.RepositoryURL)
	}
	if payload.Branch != "main" {
		t.Fatalf("expected trimmed branch, got %q", payload.Branch)
	}
	if payload.FilePath != "nauthilus.yml" {
		t.Fatalf("expected trimmed filePath, got %q", payload.FilePath)
	}
	if payload.TagName != "v1.0.0" {
		t.Fatalf("expected trimmed tagName, got %q", payload.TagName)
	}
	if payload.HTTPSUsername != "alice" {
		t.Fatalf("expected trimmed httpsUsername, got %q", payload.HTTPSUsername)
	}
	if !payload.UseSSH {
		t.Fatal("expected useSsh to remain true")
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &raw); err != nil {
		t.Fatalf("failed to decode raw response map: %v", err)
	}
	if _, exists := raw["password"]; exists {
		t.Fatal("expected password to be excluded from response payload")
	}
}
