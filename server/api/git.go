package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/integrations/gitops"
	"nauthilus-ui/server/integrations/sshprovider"
	"nauthilus-ui/server/models"
	"nauthilus-ui/server/utils"
)

// GitHandler exposes secure Git integration endpoints.
type GitHandler struct {
	service *gitops.Service
	mongoDB *db.MongoDB
}

// NewGitHandler creates a new Git API handler.
func NewGitHandler(service *gitops.Service, mongoDB *db.MongoDB) *GitHandler {
	return &GitHandler{service: service, mongoDB: mongoDB}
}

// RegisterRoutes registers Git integration routes.
func (h *GitHandler) RegisterRoutes(router *gin.Engine) {
	apiGroup := router.Group("/api/git")
	apiGroup.GET("/capabilities", h.GetCapabilities)
	apiGroup.POST("/pull", h.Pull)
	apiGroup.POST("/push", h.Push)
}

type gitAuthRequest struct {
	UseSSH     bool   `json:"useSsh"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	Passphrase string `json:"passphrase"`
}

type gitPullRequest struct {
	RepositoryURL string         `json:"repositoryUrl"`
	Branch        string         `json:"branch"`
	FilePath      string         `json:"filePath"`
	Auth          gitAuthRequest `json:"auth"`
}

type gitPushRequest struct {
	RepositoryURL string         `json:"repositoryUrl"`
	Branch        string         `json:"branch"`
	FilePath      string         `json:"filePath"`
	CommitMessage string         `json:"commitMessage"`
	Content       string         `json:"content"`
	Auth          gitAuthRequest `json:"auth"`
}

// GetCapabilities returns Git/SSH capabilities for the current user.
func (h *GitHandler) GetCapabilities(ctx *gin.Context) {
	if h.service == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Git service unavailable"})
		return
	}

	username := strings.TrimSpace(CurrentUsername(ctx))
	capabilities := h.service.CapabilitiesForUser(username)
	ctx.JSON(http.StatusOK, capabilities)
}

// Pull imports the configured profile file from a Git repository.
func (h *GitHandler) Pull(ctx *gin.Context) {
	if h.service == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Git service unavailable"})
		return
	}

	var request gitPullRequest
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	actor := strings.TrimSpace(CurrentUsername(ctx))
	result, err := h.service.Pull(ctx.Request.Context(), actor, gitops.PullRequest{
		RepositoryURL: request.RepositoryURL,
		Branch:        request.Branch,
		FilePath:      request.FilePath,
		Auth: gitops.AuthOptions{
			UseSSH:     request.Auth.UseSSH,
			Username:   request.Auth.Username,
			Password:   request.Auth.Password,
			Passphrase: request.Auth.Passphrase,
		},
	})
	if err != nil {
		h.writeGitError(ctx, "git.pull", request.RepositoryURL, request.Branch, request.FilePath, err)
		return
	}

	WriteAudit(ctx, h.mongoDB, models.AuditLogEntry{
		Action: "git.pull",
		Target: utils.RedactURLString(request.RepositoryURL),
		Details: map[string]interface{}{
			"branch":      strings.TrimSpace(result.Branch),
			"file_path":   strings.TrimSpace(result.FilePath),
			"commit_hash": strings.TrimSpace(result.CommitHash),
		},
	})

	ctx.JSON(http.StatusOK, result)
}

// Push exports the current profile file into a Git repository.
func (h *GitHandler) Push(ctx *gin.Context) {
	if h.service == nil {
		ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "Git service unavailable"})
		return
	}

	var request gitPushRequest
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	actor := strings.TrimSpace(CurrentUsername(ctx))
	result, err := h.service.Push(ctx.Request.Context(), actor, gitops.PushRequest{
		RepositoryURL: request.RepositoryURL,
		Branch:        request.Branch,
		FilePath:      request.FilePath,
		CommitMessage: request.CommitMessage,
		Content:       request.Content,
		Auth: gitops.AuthOptions{
			UseSSH:     request.Auth.UseSSH,
			Username:   request.Auth.Username,
			Password:   request.Auth.Password,
			Passphrase: request.Auth.Passphrase,
		},
	})
	if err != nil {
		h.writeGitError(ctx, "git.push", request.RepositoryURL, request.Branch, request.FilePath, err)
		return
	}

	WriteAudit(ctx, h.mongoDB, models.AuditLogEntry{
		Action: "git.push",
		Target: utils.RedactURLString(request.RepositoryURL),
		Details: map[string]interface{}{
			"branch":      strings.TrimSpace(result.Branch),
			"file_path":   strings.TrimSpace(result.FilePath),
			"commit_hash": strings.TrimSpace(result.CommitHash),
			"no_changes":  result.NoChanges,
		},
	})

	ctx.JSON(http.StatusOK, result)
}

func (h *GitHandler) writeGitError(ctx *gin.Context, action, repositoryURL, branch, filePath string, err error) {
	status, code, message := mapGitError(err)

	WriteAudit(ctx, h.mongoDB, models.AuditLogEntry{
		Action: action,
		Target: utils.RedactURLString(repositoryURL),
		Details: map[string]interface{}{
			"status":    status,
			"code":      code,
			"branch":    strings.TrimSpace(branch),
			"file_path": strings.TrimSpace(filePath),
		},
	})

	ctx.JSON(status, gin.H{
		"error": message,
		"code":  code,
	})
}

func mapGitError(err error) (int, string, string) {
	switch {
	case errors.Is(err, gitops.ErrIntegrationDisabled):
		return http.StatusForbidden, "git_integration_disabled", "Git integration is disabled"
	case errors.Is(err, gitops.ErrInvalidRepositoryURL):
		return http.StatusBadRequest, "git_invalid_repository_url", "Repository URL is invalid or unsupported"
	case errors.Is(err, gitops.ErrInvalidBranch):
		return http.StatusBadRequest, "git_invalid_branch", "Branch is invalid"
	case errors.Is(err, gitops.ErrInvalidFilePath):
		return http.StatusBadRequest, "git_invalid_file_path", "File path is invalid"
	case errors.Is(err, gitops.ErrMissingHTTPSCredentials):
		return http.StatusBadRequest, "git_missing_https_credentials", "Username and password are required for HTTPS auth"
	case errors.Is(err, sshprovider.ErrUserNotMapped):
		return http.StatusForbidden, "ssh_mapping_missing", "No SSH key is configured for the current user"
	case errors.Is(err, sshprovider.ErrPassphraseRequired):
		return http.StatusBadRequest, "ssh_passphrase_required", "SSH key passphrase is required"
	case errors.Is(err, sshprovider.ErrInvalidPassphrase):
		return http.StatusBadRequest, "ssh_invalid_passphrase", "SSH key passphrase is invalid"
	case errors.Is(err, sshprovider.ErrInsecurePrivateKeyPermissions):
		return http.StatusInternalServerError, "ssh_insecure_key_permissions", "SSH private key permissions are too permissive"
	default:
		return http.StatusInternalServerError, "git_operation_failed", "Git operation failed"
	}
}
