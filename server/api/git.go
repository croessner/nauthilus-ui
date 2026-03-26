package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"nauthilus-ui/server/db"
	"nauthilus-ui/server/integrations/gitops"
	"nauthilus-ui/server/integrations/sshprovider"
	"nauthilus-ui/server/models"
	"nauthilus-ui/server/utils"
)

const (
	maxGitRepositoryURLLength = 2048
	maxGitBranchLength        = 255
	maxGitFilePathLength      = 1024
	maxGitTagLength           = 255
	maxGitUsernameLength      = 255
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
	apiGroup.GET("/settings/:profileName", h.GetSettings)
	apiGroup.POST("/settings/:profileName", h.SaveSettings)
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
	TagName       string         `json:"tagName"`
	Content       string         `json:"content"`
	Auth          gitAuthRequest `json:"auth"`
}

type gitSettingsRequest struct {
	RepositoryURL string `json:"repositoryUrl"`
	Branch        string `json:"branch"`
	FilePath      string `json:"filePath"`
	TagName       string `json:"tagName"`
	UseSSH        bool   `json:"useSsh"`
	HTTPSUsername string `json:"httpsUsername"`
}

func trimToMax(raw string, maxLen int) string {
	trimmed := strings.TrimSpace(raw)
	if maxLen <= 0 || len(trimmed) <= maxLen {
		return trimmed
	}

	return trimmed[:maxLen]
}

func normalizeGitSettingsPayload(raw gitSettingsRequest) models.GitSettingsResponse {
	return models.GitSettingsResponse{
		RepositoryURL: trimToMax(raw.RepositoryURL, maxGitRepositoryURLLength),
		Branch:        trimToMax(raw.Branch, maxGitBranchLength),
		FilePath:      trimToMax(raw.FilePath, maxGitFilePathLength),
		TagName:       trimToMax(raw.TagName, maxGitTagLength),
		UseSSH:        raw.UseSSH,
		HTTPSUsername: trimToMax(raw.HTTPSUsername, maxGitUsernameLength),
	}
}

func resolveGitSettingsProfileName(ctx *gin.Context) (string, bool) {
	profileName := strings.TrimSpace(ctx.Param("profileName"))
	if profileName == "" {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Profile name is required"})
		return "", false
	}

	return profileName, true
}

func mapGitSettingsDocument(document models.GitSettings) models.GitSettingsResponse {
	return models.GitSettingsResponse{
		RepositoryURL: strings.TrimSpace(document.RepositoryURL),
		Branch:        strings.TrimSpace(document.Branch),
		FilePath:      strings.TrimSpace(document.FilePath),
		TagName:       strings.TrimSpace(document.TagName),
		UseSSH:        document.UseSSH,
		HTTPSUsername: strings.TrimSpace(document.HTTPSUsername),
	}
}

func (h *GitHandler) saveGitSettingsDocument(
	ctx context.Context,
	userID, profileName string,
	payload models.GitSettingsResponse,
) (models.GitSettings, error) {
	filter := bson.M{"userId": userID, "profileName": profileName}
	now := time.Now().Format(time.RFC3339)
	update := bson.M{
		"$set": bson.M{
			"userId":         userID,
			"profileName":    profileName,
			"repositoryUrl":  payload.RepositoryURL,
			"branch":         payload.Branch,
			"filePath":       payload.FilePath,
			"tagName":        payload.TagName,
			"useSsh":         payload.UseSSH,
			"httpsUsername":  payload.HTTPSUsername,
			"lastModifiedBy": userID,
			"updatedAt":      now,
		},
	}

	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	var persisted models.GitSettings
	err := h.mongoDB.GitSettingsColl.FindOneAndUpdate(ctx, filter, update, opts).Decode(&persisted)

	return persisted, err
}

// GetSettings loads persisted Git dialog settings for the authenticated user and target profile.
func (h *GitHandler) GetSettings(ctx *gin.Context) {
	userID := strings.TrimSpace(CurrentUsername(ctx))
	if userID == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Authentication required"})
		return
	}

	profileName, ok := resolveGitSettingsProfileName(ctx)
	if !ok {
		return
	}

	if h.mongoDB == nil || !h.mongoDB.IsConnected || h.mongoDB.GitSettingsColl == nil {
		ctx.JSON(http.StatusOK, models.GitSettingsResponse{})
		return
	}

	var document models.GitSettings
	err := h.mongoDB.GitSettingsColl.FindOne(
		ctx.Request.Context(),
		bson.M{"userId": userID, "profileName": profileName},
	).Decode(&document)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			ctx.JSON(http.StatusOK, models.GitSettingsResponse{})
			return
		}

		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to load Git settings"})
		return
	}

	ctx.JSON(http.StatusOK, mapGitSettingsDocument(document))
}

// SaveSettings persists Git dialog settings per authenticated user and profile.
func (h *GitHandler) SaveSettings(ctx *gin.Context) {
	userID := strings.TrimSpace(CurrentUsername(ctx))
	if userID == "" {
		ctx.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "Authentication required"})
		return
	}

	profileName, ok := resolveGitSettingsProfileName(ctx)
	if !ok {
		return
	}

	var request gitSettingsRequest
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	payload := normalizeGitSettingsPayload(request)
	if h.mongoDB == nil || !h.mongoDB.IsConnected || h.mongoDB.GitSettingsColl == nil {
		ctx.JSON(http.StatusOK, payload)
		return
	}

	persisted, err := h.saveGitSettingsDocument(ctx.Request.Context(), userID, profileName, payload)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to save Git settings"})
		return
	}

	WriteAudit(ctx, h.mongoDB, models.AuditLogEntry{
		Action: "git.settings.update",
		Target: userID + "/" + profileName,
		Details: map[string]interface{}{
			"repository_url": utils.RedactURLString(persisted.RepositoryURL),
			"branch":         strings.TrimSpace(persisted.Branch),
			"file_path":      strings.TrimSpace(persisted.FilePath),
			"tag_name":       strings.TrimSpace(persisted.TagName),
			"use_ssh":        persisted.UseSSH,
			"https_username": strings.TrimSpace(persisted.HTTPSUsername),
		},
	})

	ctx.JSON(http.StatusOK, mapGitSettingsDocument(persisted))
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
		TagName:       request.TagName,
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
			"branch":             strings.TrimSpace(result.Branch),
			"file_path":          strings.TrimSpace(result.FilePath),
			"commit_hash":        strings.TrimSpace(result.CommitHash),
			"no_changes":         result.NoChanges,
			"tag_name":           strings.TrimSpace(result.TagName),
			"tag_already_exists": result.TagAlreadyExists,
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
	case errors.Is(err, gitops.ErrInvalidTag):
		return http.StatusBadRequest, "git_invalid_tag", "Tag is invalid"
	case errors.Is(err, gitops.ErrInvalidFilePath):
		return http.StatusBadRequest, "git_invalid_file_path", "File path is invalid"
	case errors.Is(err, gitops.ErrMissingHTTPSCredentials):
		return http.StatusBadRequest, "git_missing_https_credentials", "Username and password are required for HTTPS auth"
	case errors.Is(err, gitops.ErrRepositoryUnreachable):
		return http.StatusBadRequest, "git_repository_unreachable", "Repository host is not reachable from the server runtime"
	case errors.Is(err, gitops.ErrRepositoryAuthFailed):
		return http.StatusBadRequest, "git_repository_auth_failed", "Repository authentication failed"
	case errors.Is(err, gitops.ErrRepositoryNotFound):
		return http.StatusNotFound, "git_repository_not_found", "Repository was not found"
	case errors.Is(err, gitops.ErrSSHHostKeyVerificationFailed):
		return http.StatusBadRequest, "git_ssh_host_key_verification_failed", "SSH host key verification failed"
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
