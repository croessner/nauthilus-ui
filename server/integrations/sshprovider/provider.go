package sshprovider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	// ErrUserNotMapped indicates that no SSH key mapping exists for the current UI user.
	ErrUserNotMapped = errors.New("no ssh mapping configured for user")
	// ErrPassphraseRequired indicates that an encrypted private key requires a passphrase.
	ErrPassphraseRequired = errors.New("ssh key passphrase is required")
	// ErrInvalidPassphrase indicates that the supplied passphrase cannot decrypt the private key.
	ErrInvalidPassphrase = errors.New("ssh key passphrase is invalid")
	// ErrInsecurePrivateKeyPermissions indicates that private key permissions are too open.
	ErrInsecurePrivateKeyPermissions = errors.New("ssh private key permissions are too permissive")
	// ErrTunnelStartTimeout indicates that an SSH tunnel could not be established in time.
	ErrTunnelStartTimeout = errors.New("ssh tunnel did not become ready in time")
)

// UserMapping binds one UI user to one SSH key identity.
type UserMapping struct {
	Username       string
	SSHUser        string
	PrivateKeyPath string
	KnownHostsPath string
}

// Tunnel represents a running SSH local-forward process.
type Tunnel struct {
	LocalPort int
	closeFn   func() error
	closeOnce sync.Once
}

// Close terminates the tunnel process and releases temporary artifacts.
func (t *Tunnel) Close() error {
	if t == nil || t.closeFn == nil {
		return nil
	}

	var closeErr error
	t.closeOnce.Do(func() {
		closeErr = t.closeFn()
	})

	return closeErr
}

// Provider resolves SSH credentials for the currently authenticated UI user.
type Provider struct {
	passphraseCacheSeconds int
	users                  map[string]UserMapping
}

// NewProvider creates a new SSH provider with normalized user mappings.
func NewProvider(passphraseCacheSeconds int, mappings []UserMapping) *Provider {
	users := make(map[string]UserMapping, len(mappings))

	for _, mapping := range mappings {
		username := strings.TrimSpace(mapping.Username)
		sshUser := strings.TrimSpace(mapping.SSHUser)
		privateKeyPath := strings.TrimSpace(mapping.PrivateKeyPath)
		knownHostsPath := strings.TrimSpace(mapping.KnownHostsPath)
		if username == "" || sshUser == "" || privateKeyPath == "" || knownHostsPath == "" {
			continue
		}

		users[username] = UserMapping{
			Username:       username,
			SSHUser:        sshUser,
			PrivateKeyPath: privateKeyPath,
			KnownHostsPath: knownHostsPath,
		}
	}

	return &Provider{
		passphraseCacheSeconds: passphraseCacheSeconds,
		users:                  users,
	}
}

// PassphraseCacheSeconds returns the configured browser-side passphrase cache TTL.
func (p *Provider) PassphraseCacheSeconds() int {
	if p == nil {
		return -1
	}

	return p.passphraseCacheSeconds
}

// HasUser reports whether an SSH mapping exists for the given UI user.
func (p *Provider) HasUser(username string) bool {
	if p == nil {
		return false
	}

	_, exists := p.users[strings.TrimSpace(username)]
	return exists
}

// ResolveUser returns the normalized SSH mapping for a UI user.
func (p *Provider) ResolveUser(username string) (UserMapping, error) {
	if p == nil {
		return UserMapping{}, ErrUserNotMapped
	}

	mapping, exists := p.users[strings.TrimSpace(username)]
	if !exists {
		return UserMapping{}, ErrUserNotMapped
	}

	if err := validatePrivateKeyPermissions(mapping.PrivateKeyPath); err != nil {
		return UserMapping{}, err
	}

	return mapping, nil
}

// PrepareGitEnvironment builds per-command environment variables for secure Git-over-SSH calls.
// The caller must defer the returned cleanup function.
func (p *Provider) PrepareGitEnvironment(username, passphrase string) ([]string, func(), error) {
	mapping, err := p.ResolveUser(username)
	if err != nil {
		return nil, nil, err
	}

	cleanupFns := make([]func(), 0, 2)
	cleanup := func() {
		for index := len(cleanupFns) - 1; index >= 0; index-- {
			cleanupFns[index]()
		}
	}

	sshArgs := buildSSHClientArgs(mapping, strings.TrimSpace(passphrase) == "")
	sshScriptPath, err := writeExecutableScript(buildSSHWrapperScript(sshArgs))
	if err != nil {
		cleanup()
		return nil, nil, err
	}
	cleanupFns = append(cleanupFns, func() { _ = os.Remove(sshScriptPath) })

	env := []string{
		"GIT_TERMINAL_PROMPT=0",
		"GIT_SSH_COMMAND=" + sshScriptPath,
	}

	if strings.TrimSpace(passphrase) != "" {
		askpassPath, askpassEnv, askpassCleanup, askpassErr := prepareAskpass(passphrase)
		if askpassErr != nil {
			cleanup()
			return nil, nil, askpassErr
		}

		cleanupFns = append(cleanupFns, askpassCleanup)
		env = append(env,
			"SSH_ASKPASS="+askpassPath,
			"SSH_ASKPASS_REQUIRE=force",
			"DISPLAY=nauthilus-ui:0",
		)
		env = append(env, askpassEnv...)
	}

	return env, cleanup, nil
}

// StartTunnel creates a short-lived local SSH tunnel. Requests can target 127.0.0.1:LocalPort.
func (p *Provider) StartTunnel(
	ctx context.Context,
	username, passphrase, sshHost string,
	sshPort int,
	targetHost string,
	targetPort int,
	startupTimeout time.Duration,
) (*Tunnel, error) {
	mapping, err := p.ResolveUser(username)
	if err != nil {
		return nil, err
	}

	if err := validateHost(sshHost); err != nil {
		return nil, fmt.Errorf("invalid ssh host: %w", err)
	}

	if err := validateHost(targetHost); err != nil {
		return nil, fmt.Errorf("invalid tunnel target host: %w", err)
	}

	if sshPort < 1 || sshPort > 65535 {
		return nil, fmt.Errorf("invalid ssh port %d", sshPort)
	}

	if targetPort < 1 || targetPort > 65535 {
		return nil, fmt.Errorf("invalid tunnel target port %d", targetPort)
	}

	localPort, err := allocateLoopbackPort()
	if err != nil {
		return nil, fmt.Errorf("failed to allocate local tunnel port: %w", err)
	}

	cleanupFns := make([]func(), 0, 2)
	cleanup := func() {
		for index := len(cleanupFns) - 1; index >= 0; index-- {
			cleanupFns[index]()
		}
	}

	sshArgs := buildSSHClientArgs(mapping, strings.TrimSpace(passphrase) == "")
	sshArgs = append(sshArgs,
		"-N",
		"-p", strconv.Itoa(sshPort),
		"-L", fmt.Sprintf("127.0.0.1:%d:%s:%d", localPort, targetHost, targetPort),
		fmt.Sprintf("%s@%s", mapping.SSHUser, sshHost),
	)

	cmd := exec.CommandContext(ctx, "ssh", sshArgs...)
	stderr := &bytes.Buffer{}
	cmd.Stderr = stderr

	if strings.TrimSpace(passphrase) != "" {
		_, askpassEnv, askpassCleanup, askpassErr := prepareAskpass(passphrase)
		if askpassErr != nil {
			cleanup()
			return nil, askpassErr
		}

		cleanupFns = append(cleanupFns, askpassCleanup)
		cmd.Env = append(os.Environ(), askpassEnv...)
		cmd.Env = append(cmd.Env,
			"SSH_ASKPASS_REQUIRE=force",
			"DISPLAY=nauthilus-ui:0",
		)
	}

	if startErr := cmd.Start(); startErr != nil {
		cleanup()
		return nil, fmt.Errorf("failed to start ssh tunnel process: %w", startErr)
	}

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	timeout := startupTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	readyDeadline := time.NewTimer(timeout)
	defer readyDeadline.Stop()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		if err := checkLoopbackReady(localPort); err == nil {
			break
		}

		select {
		case waitErr := <-waitCh:
			cleanup()
			return nil, classifySSHCommandError(waitErr, stderr.String())
		case <-readyDeadline.C:
			_ = terminateProcess(cmd)
			<-waitCh
			cleanup()
			return nil, ErrTunnelStartTimeout
		case <-ticker.C:
		}
	}

	tunnel := &Tunnel{LocalPort: localPort}
	tunnel.closeFn = func() error {
		processErr := terminateProcess(cmd)
		<-waitCh
		cleanup()
		return processErr
	}

	return tunnel, nil
}

func buildSSHClientArgs(mapping UserMapping, batchMode bool) []string {
	args := []string{
		"-i", mapping.PrivateKeyPath,
		"-o", "IdentitiesOnly=yes",
		"-o", "StrictHostKeyChecking=yes",
		"-o", "UserKnownHostsFile=" + mapping.KnownHostsPath,
		"-o", "PreferredAuthentications=publickey",
		"-o", "PasswordAuthentication=no",
		"-o", "KbdInteractiveAuthentication=no",
	}

	if batchMode {
		args = append(args, "-o", "BatchMode=yes")
	} else {
		args = append(args, "-o", "BatchMode=no")
	}

	return args
}

func buildSSHWrapperScript(args []string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		quoted = append(quoted, shellQuote(arg))
	}

	return "#!/bin/sh\nexec ssh " + strings.Join(quoted, " ") + " \"$@\"\n"
}

func writeExecutableScript(content string) (string, error) {
	dir, err := os.MkdirTemp("", "nauthilus-ui-ssh-")
	if err != nil {
		return "", fmt.Errorf("failed to create ssh helper temp directory: %w", err)
	}

	scriptPath := filepath.Join(dir, "run.sh")
	if writeErr := os.WriteFile(scriptPath, []byte(content), 0o700); writeErr != nil {
		_ = os.RemoveAll(dir)
		return "", fmt.Errorf("failed to write ssh helper script: %w", writeErr)
	}

	return scriptPath, nil
}

func prepareAskpass(passphrase string) (string, []string, func(), error) {
	dir, err := os.MkdirTemp("", "nauthilus-ui-askpass-")
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to create askpass temp directory: %w", err)
	}

	scriptPath := filepath.Join(dir, "askpass.sh")
	script := "#!/bin/sh\nprintf '%s\\n' \"$NAUTHILUS_UI_SSH_PASSPHRASE\"\n"
	if writeErr := os.WriteFile(scriptPath, []byte(script), 0o700); writeErr != nil {
		_ = os.RemoveAll(dir)
		return "", nil, nil, fmt.Errorf("failed to write askpass script: %w", writeErr)
	}

	env := []string{
		"NAUTHILUS_UI_SSH_PASSPHRASE=" + passphrase,
		"SSH_ASKPASS=" + scriptPath,
	}

	cleanup := func() {
		_ = os.RemoveAll(dir)
	}

	return scriptPath, env, cleanup, nil
}

func allocateLoopbackPort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}

	defer func() {
		_ = listener.Close()
	}()

	addr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return 0, errors.New("failed to allocate tcp loopback port")
	}

	return addr.Port, nil
}

func checkLoopbackReady(port int) error {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), 150*time.Millisecond)
	if err != nil {
		return err
	}

	_ = conn.Close()
	return nil
}

func terminateProcess(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}

	if killErr := cmd.Process.Kill(); killErr != nil && !errors.Is(killErr, os.ErrProcessDone) {
		return killErr
	}

	return nil
}

func classifySSHCommandError(commandErr error, stderr string) error {
	if commandErr == nil {
		return nil
	}

	lower := strings.ToLower(stderr)
	if strings.Contains(lower, "enter passphrase for key") || strings.Contains(lower, "passphrase") && strings.Contains(lower, "required") {
		return ErrPassphraseRequired
	}

	if strings.Contains(lower, "incorrect passphrase") || strings.Contains(lower, "decryption password incorrect") {
		return ErrInvalidPassphrase
	}

	return fmt.Errorf("ssh command failed: %w", commandErr)
}

// NormalizeCommandError maps common SSH command stderr patterns to typed errors.
func NormalizeCommandError(commandErr error, stderr string) error {
	return classifySSHCommandError(commandErr, stderr)
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}

	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func validateHost(raw string) error {
	host := strings.TrimSpace(raw)
	if host == "" {
		return errors.New("host is required")
	}

	if strings.ContainsAny(host, "\r\n\t ") {
		return errors.New("host contains invalid whitespace")
	}

	for _, r := range host {
		if !(r == '.' || r == '-' || r == '_' || r == ':' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			return errors.New("host contains unsupported characters")
		}
	}

	return nil
}

func validatePrivateKeyPermissions(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}

	fileInfo, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("failed to stat private key: %w", err)
	}

	if fileInfo.Mode().Perm()&0o077 != 0 {
		return ErrInsecurePrivateKeyPermissions
	}

	return nil
}
