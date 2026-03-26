package gitops

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"nauthilus-ui/server/integrations/sshprovider"
)

var (
	// ErrIntegrationDisabled indicates that Git integration is disabled by server policy.
	ErrIntegrationDisabled = errors.New("git integration is disabled")
	// ErrInvalidRepositoryURL indicates unsupported or malformed repository URLs.
	ErrInvalidRepositoryURL = errors.New("repository_url is invalid or unsupported")
	// ErrInvalidBranch indicates an invalid Git branch value.
	ErrInvalidBranch = errors.New("branch is invalid")
	// ErrInvalidTag indicates an invalid Git tag value.
	ErrInvalidTag = errors.New("tag is invalid")
	// ErrInvalidFilePath indicates path traversal or absolute profile file paths.
	ErrInvalidFilePath = errors.New("file_path is invalid")
	// ErrMissingHTTPSCredentials indicates missing username/password when HTTPS auth is selected.
	ErrMissingHTTPSCredentials = errors.New("username and password are required for https auth")
	// ErrRepositoryUnreachable indicates that the repository host cannot be reached from the server runtime.
	ErrRepositoryUnreachable = errors.New("repository host is not reachable from server runtime")
	// ErrRepositoryAuthFailed indicates that repository authentication failed.
	ErrRepositoryAuthFailed = errors.New("repository authentication failed")
	// ErrRepositoryNotFound indicates that the requested repository does not exist.
	ErrRepositoryNotFound = errors.New("repository not found")
	// ErrSSHHostKeyVerificationFailed indicates host key verification failure for SSH.
	ErrSSHHostKeyVerificationFailed = errors.New("ssh host key verification failed")
)

var (
	branchPattern = regexp.MustCompile(`^[A-Za-z0-9._/\-]+$`)
	scpLikeURL    = regexp.MustCompile(`^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$`)
)

// Settings configures Git integration behaviour.
type Settings struct {
	Enabled                bool
	DefaultBranch          string
	DefaultFilePath        string
	OperationTimeout       time.Duration
	MaxFileBytes           int64
	PassphraseCacheSeconds int
}

// Service executes secure pull/push operations for configuration files in Git repositories.
type Service struct {
	settings    Settings
	sshProvider *sshprovider.Provider
}

// Capabilities exposes user-facing integration capabilities.
type Capabilities struct {
	Enabled                bool   `json:"enabled"`
	SSHAvailable           bool   `json:"sshAvailable"`
	PassphraseCacheSeconds int    `json:"passphraseCacheSeconds"`
	DefaultBranch          string `json:"defaultBranch"`
	DefaultFilePath        string `json:"defaultFilePath"`
}

// AuthOptions describes either HTTPS or SSH authentication options.
type AuthOptions struct {
	UseSSH     bool
	Username   string
	Password   string
	Passphrase string
}

// PullRequest describes a Git pull/import operation.
type PullRequest struct {
	RepositoryURL string
	Branch        string
	FilePath      string
	Auth          AuthOptions
}

// PullResult contains file content and resolved Git metadata.
type PullResult struct {
	Branch     string `json:"branch"`
	FilePath   string `json:"filePath"`
	CommitHash string `json:"commitHash"`
	Content    string `json:"content"`
}

// PushRequest describes a Git push/export operation.
type PushRequest struct {
	RepositoryURL string
	Branch        string
	FilePath      string
	CommitMessage string
	TagName       string
	Content       string
	Auth          AuthOptions
}

// PushResult contains commit metadata for exported configuration data.
type PushResult struct {
	Branch           string `json:"branch"`
	FilePath         string `json:"filePath"`
	CommitHash       string `json:"commitHash"`
	NoChanges        bool   `json:"noChanges"`
	TagName          string `json:"tagName,omitempty"`
	TagAlreadyExists bool   `json:"tagAlreadyExists"`
}

// NewService creates a new Git service.
func NewService(settings Settings, sshProvider *sshprovider.Provider) *Service {
	if settings.OperationTimeout <= 0 {
		settings.OperationTimeout = 30 * time.Second
	}

	if settings.MaxFileBytes <= 0 {
		settings.MaxFileBytes = 1024 * 1024
	}

	settings.DefaultBranch = strings.TrimSpace(settings.DefaultBranch)
	if settings.DefaultBranch == "" {
		settings.DefaultBranch = "main"
	}

	settings.DefaultFilePath = strings.TrimSpace(settings.DefaultFilePath)
	if settings.DefaultFilePath == "" {
		settings.DefaultFilePath = "nauthilus.yml"
	}

	return &Service{
		settings:    settings,
		sshProvider: sshProvider,
	}
}

// CapabilitiesForUser returns secure feature flags for the current user.
func (s *Service) CapabilitiesForUser(username string) Capabilities {
	sshAvailable := s.sshProvider != nil && s.sshProvider.HasUser(username)
	cacheTTL := -1
	if s.sshProvider != nil {
		cacheTTL = s.sshProvider.PassphraseCacheSeconds()
	}

	return Capabilities{
		Enabled:                s.settings.Enabled,
		SSHAvailable:           sshAvailable,
		PassphraseCacheSeconds: cacheTTL,
		DefaultBranch:          s.settings.DefaultBranch,
		DefaultFilePath:        s.settings.DefaultFilePath,
	}
}

// Pull reads a single configuration file from Git.
func (s *Service) Pull(ctx context.Context, actor string, request PullRequest) (*PullResult, error) {
	if !s.settings.Enabled {
		return nil, ErrIntegrationDisabled
	}

	resolved, err := s.resolveAndValidateRequest(actor, request.RepositoryURL, request.Branch, request.FilePath, request.Auth)
	if err != nil {
		return nil, err
	}

	opCtx, cancel := context.WithTimeout(ctx, s.settings.OperationTimeout)
	defer cancel()

	repoDir, cleanup, err := cloneRepository(opCtx, resolved)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	contentPath, err := resolveRepositoryFilePath(repoDir, resolved.FilePath)
	if err != nil {
		return nil, err
	}

	fileInfo, statErr := os.Stat(contentPath)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) {
			return nil, fmt.Errorf("configuration file %q does not exist in repository branch", resolved.FilePath)
		}

		return nil, fmt.Errorf("failed to stat configuration file: %w", statErr)
	}

	if fileInfo.Size() > s.settings.MaxFileBytes {
		return nil, fmt.Errorf("configuration file exceeds maximum size of %d bytes", s.settings.MaxFileBytes)
	}

	contentBytes, readErr := os.ReadFile(contentPath)
	if readErr != nil {
		return nil, fmt.Errorf("failed to read configuration file: %w", readErr)
	}

	commitHash, hashErr := getHeadCommitHash(opCtx, repoDir)
	if hashErr != nil {
		return nil, hashErr
	}

	return &PullResult{
		Branch:     resolved.Branch,
		FilePath:   resolved.FilePath,
		CommitHash: commitHash,
		Content:    string(contentBytes),
	}, nil
}

// Push writes one configuration file and pushes the commit.
func (s *Service) Push(ctx context.Context, actor string, request PushRequest) (*PushResult, error) {
	if !s.settings.Enabled {
		return nil, ErrIntegrationDisabled
	}

	if strings.TrimSpace(request.Content) == "" {
		return nil, errors.New("content is required")
	}

	if int64(len(request.Content)) > s.settings.MaxFileBytes {
		return nil, fmt.Errorf("content exceeds maximum size of %d bytes", s.settings.MaxFileBytes)
	}

	resolvedTagName, err := normalizeTagName(request.TagName)
	if err != nil {
		return nil, err
	}

	resolved, err := s.resolveAndValidateRequest(actor, request.RepositoryURL, request.Branch, request.FilePath, request.Auth)
	if err != nil {
		return nil, err
	}

	opCtx, cancel := context.WithTimeout(ctx, s.settings.OperationTimeout)
	defer cancel()

	repoDir, cleanup, err := cloneRepository(opCtx, resolved)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	contentPath, err := resolveRepositoryFilePath(repoDir, resolved.FilePath)
	if err != nil {
		return nil, err
	}

	if mkdirErr := os.MkdirAll(filepath.Dir(contentPath), 0o700); mkdirErr != nil {
		return nil, fmt.Errorf("failed to create directory for configuration file: %w", mkdirErr)
	}

	if writeErr := os.WriteFile(contentPath, []byte(request.Content), 0o600); writeErr != nil {
		return nil, fmt.Errorf("failed to write configuration file: %w", writeErr)
	}

	statusOutput, statusErr := runGitCommand(opCtx, repoDir, resolved.Env, "status", "--porcelain", "--", resolved.FilePath)
	if statusErr != nil {
		return nil, statusErr
	}

	noChanges := strings.TrimSpace(statusOutput) == ""
	if !noChanges {
		message := strings.TrimSpace(request.CommitMessage)
		if message == "" {
			message = fmt.Sprintf("nauthilus-ui: update %s", resolved.FilePath)
		}

		safeActor := sanitizeCommitIdentity(actor)
		_, addErr := runGitCommand(opCtx, repoDir, resolved.Env, "add", "--", resolved.FilePath)
		if addErr != nil {
			return nil, addErr
		}

		_, commitErr := runGitCommand(opCtx, repoDir, resolved.Env,
			"-c", "user.name="+safeActor,
			"-c", "user.email="+safeActor+"@nauthilus-ui.local",
			"commit", "-m", message,
		)
		if commitErr != nil {
			return nil, commitErr
		}

		_, pushErr := runGitCommand(opCtx, repoDir, resolved.Env, "push", "origin", "HEAD:"+resolved.Branch)
		if pushErr != nil {
			return nil, pushErr
		}
	}

	commitHash, hashErr := getHeadCommitHash(opCtx, repoDir)
	if hashErr != nil {
		return nil, hashErr
	}

	tagAlreadyExists := false
	if resolvedTagName != "" {
		tagAlreadyExists, err = ensureRemoteTag(opCtx, repoDir, resolved.Env, resolvedTagName, commitHash)
		if err != nil {
			return nil, err
		}
	}

	return &PushResult{
		Branch:           resolved.Branch,
		FilePath:         resolved.FilePath,
		CommitHash:       commitHash,
		NoChanges:        noChanges,
		TagName:          resolvedTagName,
		TagAlreadyExists: tagAlreadyExists,
	}, nil
}

type resolvedRequest struct {
	RepositoryURL string
	Branch        string
	FilePath      string
	Env           []string
	Cleanup       func()
}

func (s *Service) resolveAndValidateRequest(
	actor, repositoryURL, branch, filePath string,
	auth AuthOptions,
) (*resolvedRequest, error) {
	resolvedBranch := strings.TrimSpace(branch)
	if resolvedBranch == "" {
		resolvedBranch = s.settings.DefaultBranch
	}

	if !branchPattern.MatchString(resolvedBranch) || strings.Contains(resolvedBranch, "..") || strings.HasPrefix(resolvedBranch, "/") {
		return nil, ErrInvalidBranch
	}

	resolvedFilePath, err := normalizeRepositoryFilePath(filePath, s.settings.DefaultFilePath)
	if err != nil {
		return nil, err
	}

	remoteURL, remoteErr := normalizeRepositoryURL(repositoryURL, auth)
	if remoteErr != nil {
		return nil, remoteErr
	}

	resolved := &resolvedRequest{
		RepositoryURL: remoteURL,
		Branch:        resolvedBranch,
		FilePath:      resolvedFilePath,
		Cleanup:       func() {},
	}

	if auth.UseSSH {
		if s.sshProvider == nil {
			return nil, sshprovider.ErrUserNotMapped
		}

		env, cleanup, envErr := s.sshProvider.PrepareGitEnvironment(actor, auth.Passphrase)
		if envErr != nil {
			return nil, envErr
		}

		resolved.Env = env
		resolved.Cleanup = cleanup
	}

	return resolved, nil
}

func cloneRepository(ctx context.Context, request *resolvedRequest) (string, func(), error) {
	tmpDir, err := os.MkdirTemp("", "nauthilus-ui-git-")
	if err != nil {
		request.Cleanup()
		return "", nil, fmt.Errorf("failed to create git temp directory: %w", err)
	}

	cleanup := func() {
		request.Cleanup()
		_ = os.RemoveAll(tmpDir)
	}

	_, cloneErr := runGitCommand(ctx, "", request.Env,
		"clone",
		"--depth", "1",
		"--single-branch",
		"--branch", request.Branch,
		request.RepositoryURL,
		tmpDir,
	)
	if cloneErr != nil {
		cleanup()
		return "", nil, cloneErr
	}

	return tmpDir, cleanup, nil
}

func runGitCommand(ctx context.Context, dir string, extraEnv []string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	if strings.TrimSpace(dir) != "" {
		cmd.Dir = dir
	}

	stderr := &strings.Builder{}
	stdout := &strings.Builder{}
	cmd.Stderr = stderr
	cmd.Stdout = stdout

	if len(extraEnv) > 0 {
		cmd.Env = append(os.Environ(), extraEnv...)
	}

	err := cmd.Run()
	if err != nil {
		normalized := sshprovider.NormalizeCommandError(err, stderr.String())
		if errors.Is(normalized, sshprovider.ErrPassphraseRequired) || errors.Is(normalized, sshprovider.ErrInvalidPassphrase) {
			return "", normalized
		}

		if classified := classifyGitCommandError(stderr.String()); classified != nil {
			return "", classified
		}

		return "", fmt.Errorf("git command failed: %w", err)
	}

	return stdout.String(), nil
}

func classifyGitCommandError(stderrOutput string) error {
	normalized := strings.ToLower(strings.TrimSpace(stderrOutput))
	if normalized == "" {
		return nil
	}

	switch {
	case strings.Contains(normalized, "host key verification failed"):
		return ErrSSHHostKeyVerificationFailed
	case strings.Contains(normalized, "repository not found"):
		return ErrRepositoryNotFound
	case strings.Contains(normalized, "could not resolve hostname"),
		strings.Contains(normalized, "name or service not known"),
		strings.Contains(normalized, "connection refused"),
		strings.Contains(normalized, "connection closed by remote host"),
		strings.Contains(normalized, "connection timed out"),
		strings.Contains(normalized, "operation timed out"),
		strings.Contains(normalized, "no route to host"):
		return ErrRepositoryUnreachable
	case strings.Contains(normalized, "authentication failed"),
		strings.Contains(normalized, "permission denied (publickey)"),
		strings.Contains(normalized, "permission denied"),
		strings.Contains(normalized, "could not read from remote repository"):
		return ErrRepositoryAuthFailed
	default:
		return nil
	}
}

func getHeadCommitHash(ctx context.Context, repoDir string) (string, error) {
	output, err := runGitCommand(ctx, repoDir, nil, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(output), nil
}

func ensureRemoteTag(ctx context.Context, repoDir string, extraEnv []string, tagName, commitHash string) (bool, error) {
	tagRef := "refs/tags/" + tagName
	tagListing, listErr := runGitCommand(ctx, repoDir, extraEnv, "ls-remote", "--tags", "--refs", "origin", tagRef)
	if listErr != nil {
		return false, listErr
	}

	if strings.TrimSpace(tagListing) != "" {
		return true, nil
	}

	_, tagErr := runGitCommand(ctx, repoDir, extraEnv, "tag", tagName, commitHash)
	if tagErr != nil {
		return false, tagErr
	}

	_, pushErr := runGitCommand(ctx, repoDir, extraEnv, "push", "origin", tagRef+":"+tagRef)
	if pushErr != nil {
		latestListing, latestErr := runGitCommand(ctx, repoDir, extraEnv, "ls-remote", "--tags", "--refs", "origin", tagRef)
		if latestErr == nil && strings.TrimSpace(latestListing) != "" {
			return true, nil
		}

		return false, pushErr
	}

	return false, nil
}

func normalizeRepositoryURL(raw string, auth AuthOptions) (string, error) {
	repositoryURL := strings.TrimSpace(raw)
	if repositoryURL == "" {
		return "", ErrInvalidRepositoryURL
	}

	if auth.UseSSH {
		if isSSHEndpoint(repositoryURL) {
			return repositoryURL, nil
		}

		return "", ErrInvalidRepositoryURL
	}

	parsed, err := url.Parse(repositoryURL)
	if err != nil {
		return "", ErrInvalidRepositoryURL
	}

	if strings.ToLower(parsed.Scheme) != "https" || strings.TrimSpace(parsed.Host) == "" {
		return "", ErrInvalidRepositoryURL
	}

	if parsed.User != nil {
		return "", ErrInvalidRepositoryURL
	}

	username := strings.TrimSpace(auth.Username)
	password := auth.Password
	if username == "" || password == "" {
		return "", ErrMissingHTTPSCredentials
	}

	parsed.User = url.UserPassword(username, password)
	return parsed.String(), nil
}

func isSSHEndpoint(raw string) bool {
	if scpLikeURL.MatchString(raw) {
		return true
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}

	return strings.ToLower(parsed.Scheme) == "ssh" && strings.TrimSpace(parsed.Host) != ""
}

func normalizeRepositoryFilePath(input, fallback string) (string, error) {
	candidate := strings.TrimSpace(input)
	if candidate == "" {
		candidate = strings.TrimSpace(fallback)
	}

	if candidate == "" || strings.ContainsAny(candidate, "\x00\r\n") {
		return "", ErrInvalidFilePath
	}

	if strings.HasPrefix(candidate, "/") {
		return "", ErrInvalidFilePath
	}

	cleaned := path.Clean(candidate)
	if cleaned == "." || strings.HasPrefix(cleaned, "../") || strings.Contains(cleaned, "/../") {
		return "", ErrInvalidFilePath
	}

	return cleaned, nil
}

func normalizeTagName(input string) (string, error) {
	candidate := strings.TrimSpace(input)
	if candidate == "" {
		return "", nil
	}

	if strings.ContainsAny(candidate, "\x00\t\r\n ") {
		return "", ErrInvalidTag
	}

	if strings.ContainsAny(candidate, "~^:?*[\\") {
		return "", ErrInvalidTag
	}

	if strings.HasPrefix(candidate, "/") || strings.HasSuffix(candidate, "/") || strings.HasPrefix(candidate, ".") || strings.HasSuffix(candidate, ".") || strings.HasPrefix(candidate, "-") {
		return "", ErrInvalidTag
	}

	if strings.Contains(candidate, "..") || strings.Contains(candidate, "//") || strings.Contains(candidate, "@{") {
		return "", ErrInvalidTag
	}

	parts := strings.Split(candidate, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.HasSuffix(part, ".lock") {
			return "", ErrInvalidTag
		}
	}

	for _, r := range candidate {
		if r < 0x20 || r == 0x7f {
			return "", ErrInvalidTag
		}
	}

	return candidate, nil
}

func resolveRepositoryFilePath(repoDir, relativePath string) (string, error) {
	cleanRepoDir := filepath.Clean(repoDir)
	targetPath := filepath.Clean(filepath.Join(cleanRepoDir, filepath.FromSlash(relativePath)))

	if targetPath != cleanRepoDir && !strings.HasPrefix(targetPath, cleanRepoDir+string(filepath.Separator)) {
		return "", ErrInvalidFilePath
	}

	return targetPath, nil
}

func sanitizeCommitIdentity(actor string) string {
	trimmed := strings.TrimSpace(actor)
	if trimmed == "" {
		return "nauthilus-ui"
	}

	normalized := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.' || r == '_' || r == '-':
			return r
		default:
			return '-'
		}
	}, trimmed)

	normalized = strings.Trim(normalized, "-._")
	if normalized == "" {
		return "nauthilus-ui"
	}

	return normalized
}
