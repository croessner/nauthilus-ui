package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultListenAddress   = ":8090"
	defaultRepositoryFile  = "nauthilus.yml"
	defaultTargetFile      = "/deploy/nauthilus.yml"
	defaultTargetContainer = "nauthilus-ui-demo-nauthilus"
	defaultDockerSocket    = "/var/run/docker.sock"
	defaultSSHPrivateKey   = "/demo/ssh/admin_id_ed25519"
	defaultSSHKnownHosts   = "/demo/ssh/gitea_known_hosts"
	defaultTagRegex        = "^v[0-9]+\\.[0-9]+\\.[0-9]+$"
	defaultMaxConfigBytes  = 1 * 1024 * 1024
	maxWebhookBodyBytes    = 2 * 1024 * 1024
)

// Config contains all runtime options for the deployer service.
type Config struct {
	ListenAddress      string
	RepositoryURL      string
	RepositoryFilePath string
	TargetFile         string
	TargetContainer    string
	DockerSocketPath   string
	SSHPrivateKeyPath  string
	SSHKnownHostsPath  string
	TagPattern         string
	TagRegex           *regexp.Regexp
	WebhookSecret      string
	MaxConfigBytes     int
}

// LoadConfigFromEnv validates and loads deployer configuration from environment.
func LoadConfigFromEnv() (Config, error) {
	cfg := Config{
		ListenAddress:      strings.TrimSpace(getEnv("DEPLOYER_LISTEN_ADDR", defaultListenAddress)),
		RepositoryURL:      strings.TrimSpace(os.Getenv("DEPLOYER_REPO_URL")),
		RepositoryFilePath: strings.TrimSpace(getEnv("DEPLOYER_REPO_FILE_PATH", defaultRepositoryFile)),
		TargetFile:         strings.TrimSpace(getEnv("DEPLOYER_TARGET_FILE", defaultTargetFile)),
		TargetContainer:    strings.TrimSpace(getEnv("DEPLOYER_TARGET_CONTAINER", defaultTargetContainer)),
		DockerSocketPath:   strings.TrimSpace(getEnv("DEPLOYER_DOCKER_SOCKET", defaultDockerSocket)),
		SSHPrivateKeyPath:  strings.TrimSpace(getEnv("DEPLOYER_SSH_PRIVATE_KEY", defaultSSHPrivateKey)),
		SSHKnownHostsPath:  strings.TrimSpace(getEnv("DEPLOYER_SSH_KNOWN_HOSTS", defaultSSHKnownHosts)),
		TagPattern:         strings.TrimSpace(getEnv("DEPLOYER_TAG_REGEX", defaultTagRegex)),
		WebhookSecret:      strings.TrimSpace(os.Getenv("DEPLOYER_WEBHOOK_SECRET")),
		MaxConfigBytes:     defaultMaxConfigBytes,
	}

	if maxBytesRaw := strings.TrimSpace(os.Getenv("DEPLOYER_MAX_CONFIG_BYTES")); maxBytesRaw != "" {
		maxBytes, err := strconv.Atoi(maxBytesRaw)
		if err != nil || maxBytes <= 0 {
			return Config{}, fmt.Errorf("DEPLOYER_MAX_CONFIG_BYTES must be a positive integer")
		}

		cfg.MaxConfigBytes = maxBytes
	}

	if cfg.ListenAddress == "" {
		return Config{}, errors.New("DEPLOYER_LISTEN_ADDR must not be empty")
	}

	if cfg.RepositoryURL == "" {
		return Config{}, errors.New("DEPLOYER_REPO_URL is required")
	}

	cleanPath, err := normalizeRepositoryFilePath(cfg.RepositoryFilePath)
	if err != nil {
		return Config{}, fmt.Errorf("DEPLOYER_REPO_FILE_PATH is invalid: %w", err)
	}

	cfg.RepositoryFilePath = cleanPath

	if cfg.TargetFile == "" || !filepath.IsAbs(cfg.TargetFile) {
		return Config{}, errors.New("DEPLOYER_TARGET_FILE must be an absolute path")
	}

	if cfg.TargetContainer == "" {
		return Config{}, errors.New("DEPLOYER_TARGET_CONTAINER is required")
	}

	if cfg.DockerSocketPath == "" || !filepath.IsAbs(cfg.DockerSocketPath) {
		return Config{}, errors.New("DEPLOYER_DOCKER_SOCKET must be an absolute path")
	}

	if cfg.SSHPrivateKeyPath == "" || !filepath.IsAbs(cfg.SSHPrivateKeyPath) {
		return Config{}, errors.New("DEPLOYER_SSH_PRIVATE_KEY must be an absolute path")
	}

	if cfg.SSHKnownHostsPath == "" || !filepath.IsAbs(cfg.SSHKnownHostsPath) {
		return Config{}, errors.New("DEPLOYER_SSH_KNOWN_HOSTS must be an absolute path")
	}

	if cfg.WebhookSecret == "" {
		return Config{}, errors.New("DEPLOYER_WEBHOOK_SECRET is required")
	}

	if cfg.TagPattern == "" {
		return Config{}, errors.New("DEPLOYER_TAG_REGEX must not be empty")
	}

	tagRegex, err := regexp.Compile(cfg.TagPattern)
	if err != nil {
		return Config{}, fmt.Errorf("DEPLOYER_TAG_REGEX is invalid: %w", err)
	}

	cfg.TagRegex = tagRegex

	return cfg, nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func normalizeRepositoryFilePath(raw string) (string, error) {
	cleaned := path.Clean(strings.TrimSpace(raw))
	if cleaned == "." || cleaned == "" {
		return "", errors.New("path must not be empty")
	}

	if path.IsAbs(cleaned) {
		return "", errors.New("path must be relative")
	}

	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", errors.New("path must not traverse outside repository")
	}

	return cleaned, nil
}

// GitContentFetcher retrieves configuration files for a Git tag.
type GitContentFetcher struct {
	repositoryURL      string
	repositoryFilePath string
	sshPrivateKeyPath  string
	sshKnownHostsPath  string
}

// NewGitContentFetcher creates a fetcher for repository content.
func NewGitContentFetcher(cfg Config) *GitContentFetcher {
	return &GitContentFetcher{
		repositoryURL:      cfg.RepositoryURL,
		repositoryFilePath: cfg.RepositoryFilePath,
		sshPrivateKeyPath:  cfg.SSHPrivateKeyPath,
		sshKnownHostsPath:  cfg.SSHKnownHostsPath,
	}
}

// FetchByTag clones a repository at tag and returns the configuration file content.
func (f *GitContentFetcher) FetchByTag(ctx context.Context, tagName string) ([]byte, error) {
	workDir, err := os.MkdirTemp("", "gitops-deployer-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary work directory: %w", err)
	}

	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	repoDir := filepath.Join(workDir, "repo")
	if err := f.cloneAtTag(ctx, tagName, repoDir); err != nil {
		return nil, err
	}

	filePath, err := resolveRepositoryLocalPath(repoDir, f.repositoryFilePath)
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read repository file %q: %w", f.repositoryFilePath, err)
	}

	return data, nil
}

func (f *GitContentFetcher) cloneAtTag(ctx context.Context, tagName, targetDir string) error {
	args := []string{
		"clone",
		"--depth", "1",
		"--single-branch",
		"--branch", tagName,
		f.repositoryURL,
		targetDir,
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Env = append(
		os.Environ(),
		"GIT_SSH_COMMAND="+buildGitSSHCommand(f.sshPrivateKeyPath, f.sshKnownHostsPath),
		"GIT_TERMINAL_PROMPT=0",
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git clone failed for tag %q: %w: %s", tagName, err, strings.TrimSpace(string(output)))
	}

	return nil
}

func buildGitSSHCommand(privateKeyPath, knownHostsPath string) string {
	return fmt.Sprintf(
		"ssh -i %s -o StrictHostKeyChecking=yes -o UserKnownHostsFile=%s -o IdentitiesOnly=yes",
		shellQuote(privateKeyPath),
		shellQuote(knownHostsPath),
	)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func resolveRepositoryLocalPath(repoDir, repositoryRelativePath string) (string, error) {
	relativePath := filepath.Clean(filepath.FromSlash(repositoryRelativePath))
	if relativePath == "." {
		return "", errors.New("repository path resolved to root")
	}

	localPath := filepath.Join(repoDir, relativePath)
	repoRoot := filepath.Clean(repoDir)
	resolvedLocal := filepath.Clean(localPath)
	if !strings.HasPrefix(resolvedLocal+string(os.PathSeparator), repoRoot+string(os.PathSeparator)) && resolvedLocal != repoRoot {
		return "", errors.New("resolved path escaped repository root")
	}

	return resolvedLocal, nil
}

// DockerRestarter restarts one Docker container using the Docker Unix socket API.
type DockerRestarter struct {
	socketPath    string
	containerName string
	httpClient    *http.Client
}

// NewDockerRestarter creates a Docker API client for container restart operations.
func NewDockerRestarter(socketPath, containerName string) *DockerRestarter {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, "unix", socketPath)
		},
	}

	return &DockerRestarter{
		socketPath:    socketPath,
		containerName: containerName,
		httpClient: &http.Client{
			Timeout:   20 * time.Second,
			Transport: transport,
		},
	}
}

// Restart triggers a container restart using Docker daemon API.
func (r *DockerRestarter) Restart(ctx context.Context) error {
	target := fmt.Sprintf("http://docker/containers/%s/restart?t=10", url.PathEscape(r.containerName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, nil)
	if err != nil {
		return fmt.Errorf("failed to build Docker restart request: %w", err)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("docker restart request failed: %w", err)
	}

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("docker restart returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return nil
}

// TagDeployer performs deployment operations for a single Git tag.
type TagDeployer interface {
	DeployTag(ctx context.Context, tagName string) error
}

// DeploymentService fetches, writes and applies repository configuration.
type DeploymentService struct {
	fetcher   *GitContentFetcher
	restarter *DockerRestarter
	logger    *slog.Logger
	target    string
	maxBytes  int
	mu        sync.Mutex
}

// NewDeploymentService creates a new deployer service.
func NewDeploymentService(cfg Config, fetcher *GitContentFetcher, restarter *DockerRestarter, logger *slog.Logger) *DeploymentService {
	return &DeploymentService{
		fetcher:   fetcher,
		restarter: restarter,
		logger:    logger,
		target:    cfg.TargetFile,
		maxBytes:  cfg.MaxConfigBytes,
	}
}

// DeployTag updates the target configuration file from a Git tag and restarts the target container.
func (s *DeploymentService) DeployTag(ctx context.Context, tagName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.logger.Info("Starting deployment", "tag", tagName, "targetFile", s.target)
	content, err := s.fetcher.FetchByTag(ctx, tagName)
	if err != nil {
		return err
	}

	trimmed := strings.TrimSpace(string(content))
	if trimmed == "" {
		return errors.New("configuration file is empty")
	}

	if len(content) > s.maxBytes {
		return fmt.Errorf("configuration file exceeds maximum size of %d bytes", s.maxBytes)
	}

	if err := writeFileAtomically(s.target, content, 0o600); err != nil {
		return err
	}

	if err := s.restarter.Restart(ctx); err != nil {
		return err
	}

	s.logger.Info("Deployment completed", "tag", tagName, "bytes", len(content))

	return nil
}

func writeFileAtomically(targetPath string, content []byte, permission os.FileMode) error {
	targetDir := filepath.Dir(targetPath)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return fmt.Errorf("failed to create target directory: %w", err)
	}

	tempFile, err := os.CreateTemp(targetDir, ".nauthilus.yml.*")
	if err != nil {
		return fmt.Errorf("failed to create temporary target file: %w", err)
	}

	tempPath := tempFile.Name()
	defer func() {
		_ = os.Remove(tempPath)
	}()

	if _, err := tempFile.Write(content); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("failed to write temporary target file: %w", err)
	}

	if err := tempFile.Sync(); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("failed to sync temporary target file: %w", err)
	}

	if err := tempFile.Chmod(permission); err != nil {
		_ = tempFile.Close()
		return fmt.Errorf("failed to set permissions on temporary target file: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("failed to close temporary target file: %w", err)
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		return fmt.Errorf("failed to atomically replace target file: %w", err)
	}

	return nil
}

type webhookPayload struct {
	Ref string `json:"ref"`
}

// WebhookHandler validates and processes Gitea webhook events.
type WebhookHandler struct {
	secret   string
	tagRegex *regexp.Regexp
	deployer TagDeployer
	logger   *slog.Logger
}

// NewWebhookHandler creates a webhook handler instance.
func NewWebhookHandler(secret string, tagRegex *regexp.Regexp, deployer TagDeployer, logger *slog.Logger) *WebhookHandler {
	return &WebhookHandler{
		secret:   secret,
		tagRegex: tagRegex,
		deployer: deployer,
		logger:   logger,
	}
}

// ServeHTTP handles webhook delivery requests.
func (h *WebhookHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writeJSON(writer, http.StatusMethodNotAllowed, map[string]interface{}{
			"error": "method_not_allowed",
		})
		return
	}

	body, err := io.ReadAll(io.LimitReader(request.Body, maxWebhookBodyBytes))
	if err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]interface{}{
			"error": "invalid_request_body",
		})
		return
	}

	signature := strings.TrimSpace(request.Header.Get("X-Gitea-Signature"))
	if !verifyGiteaSignature(h.secret, body, signature) {
		h.logger.Warn("Rejected webhook with invalid signature")
		writeJSON(writer, http.StatusUnauthorized, map[string]interface{}{
			"error": "invalid_signature",
		})
		return
	}

	eventType := strings.TrimSpace(request.Header.Get("X-Gitea-Event"))
	if !strings.EqualFold(eventType, "push") {
		writeJSON(writer, http.StatusAccepted, map[string]interface{}{
			"status": "ignored_event_type",
			"event":  eventType,
		})
		return
	}

	var payload webhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, map[string]interface{}{
			"error": "invalid_json",
		})
		return
	}

	tagName, hasTag := tagNameFromRef(payload.Ref)
	if !hasTag {
		writeJSON(writer, http.StatusAccepted, map[string]interface{}{
			"status": "ignored_non_tag_ref",
			"ref":    payload.Ref,
		})
		return
	}

	if !h.tagRegex.MatchString(tagName) {
		h.logger.Info("Ignoring tag that does not match deploy pattern", "tag", tagName)
		writeJSON(writer, http.StatusAccepted, map[string]interface{}{
			"status": "ignored_tag_not_allowed",
			"tag":    tagName,
		})
		return
	}

	deployCtx, cancel := context.WithTimeout(request.Context(), 45*time.Second)
	defer cancel()

	if err := h.deployer.DeployTag(deployCtx, tagName); err != nil {
		h.logger.Error("Deployment failed", "tag", tagName, "error", err)
		writeJSON(writer, http.StatusInternalServerError, map[string]interface{}{
			"error": "deployment_failed",
		})
		return
	}

	writeJSON(writer, http.StatusOK, map[string]interface{}{
		"status": "deployed",
		"tag":    tagName,
	})
}

func verifyGiteaSignature(secret string, payload []byte, signatureHex string) bool {
	if secret == "" || signatureHex == "" {
		return false
	}

	received, err := hex.DecodeString(signatureHex)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)

	return hmac.Equal(mac.Sum(nil), received)
}

func tagNameFromRef(ref string) (string, bool) {
	const prefix = "refs/tags/"
	if !strings.HasPrefix(ref, prefix) {
		return "", false
	}

	tagName := strings.TrimSpace(strings.TrimPrefix(ref, prefix))
	if tagName == "" {
		return "", false
	}

	if strings.ContainsAny(tagName, "\r\n\t ") {
		return "", false
	}

	return tagName, true
}

func writeJSON(writer http.ResponseWriter, statusCode int, payload map[string]interface{}) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(payload)
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := LoadConfigFromEnv()
	if err != nil {
		logger.Error("Invalid configuration", "error", err)
		os.Exit(1)
	}

	fetcher := NewGitContentFetcher(cfg)
	restarter := NewDockerRestarter(cfg.DockerSocketPath, cfg.TargetContainer)
	service := NewDeploymentService(cfg, fetcher, restarter, logger)
	webhookHandler := NewWebhookHandler(cfg.WebhookSecret, cfg.TagRegex, service, logger)

	mux := http.NewServeMux()
	mux.Handle("/webhook", webhookHandler)
	mux.HandleFunc("/healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]interface{}{
			"status": "ok",
		})
	})

	server := &http.Server{
		Addr:              cfg.ListenAddress,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	logger.Info("Starting gitops deployer",
		"listen", cfg.ListenAddress,
		"targetContainer", cfg.TargetContainer,
		"targetFile", cfg.TargetFile,
		"repoFilePath", cfg.RepositoryFilePath,
		"tagPattern", cfg.TagPattern,
	)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("Server terminated with error", "error", err)
		os.Exit(1)
	}
}
