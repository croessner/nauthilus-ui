package api

import (
	"errors"
	"net/http"
	"testing"

	"nauthilus-ui/server/integrations/gitops"
	"nauthilus-ui/server/integrations/sshprovider"
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
