package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestTagNameFromRef(t *testing.T) {
	tests := []struct {
		name string
		ref  string
		tag  string
		ok   bool
	}{
		{name: "valid tag ref", ref: "refs/tags/v1.2.3", tag: "v1.2.3", ok: true},
		{name: "branch ref ignored", ref: "refs/heads/main", tag: "", ok: false},
		{name: "empty tag ignored", ref: "refs/tags/", tag: "", ok: false},
		{name: "whitespace tag ignored", ref: "refs/tags/release candidate", tag: "", ok: false},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			tag, ok := tagNameFromRef(testCase.ref)
			if ok != testCase.ok {
				t.Fatalf("unexpected ok value: got %v, want %v", ok, testCase.ok)
			}

			if tag != testCase.tag {
				t.Fatalf("unexpected tag value: got %q, want %q", tag, testCase.tag)
			}
		})
	}
}

func TestVerifyGiteaSignature(t *testing.T) {
	secret := "demo-secret"
	payload := []byte(`{"ref":"refs/tags/v1.2.3"}`)

	validSignature := signPayload(secret, payload)
	if !verifyGiteaSignature(secret, payload, validSignature) {
		t.Fatal("expected signature verification to succeed")
	}

	if verifyGiteaSignature(secret, payload, "deadbeef") {
		t.Fatal("expected invalid signature to fail verification")
	}
}

func TestNormalizeRepositoryFilePath(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "relative path accepted", input: "configs/nauthilus.yml", want: "configs/nauthilus.yml"},
		{name: "absolute path rejected", input: "/etc/passwd", wantErr: true},
		{name: "traversal rejected", input: "../nauthilus.yml", wantErr: true},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := normalizeRepositoryFilePath(testCase.input)
			if testCase.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q", testCase.input)
				}

				return
			}

			if err != nil {
				t.Fatalf("did not expect error: %v", err)
			}

			if got != testCase.want {
				t.Fatalf("unexpected normalized path: got %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestWriteFileAtomically(t *testing.T) {
	tempDir := t.TempDir()
	target := filepath.Join(tempDir, "nauthilus.yml")
	content := []byte("server:\n  instance_name: demo\n")

	if err := writeFileAtomically(target, content, 0o600); err != nil {
		t.Fatalf("writeFileAtomically failed: %v", err)
	}

	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("failed to read target file: %v", err)
	}

	if !bytes.Equal(data, content) {
		t.Fatalf("unexpected file content: got %q, want %q", string(data), string(content))
	}
}

type fakeConfigFetcher struct {
	content   []byte
	err       error
	lastTag   string
	callCount int
}

func (f *fakeConfigFetcher) FetchByTag(_ context.Context, tagName string) ([]byte, error) {
	f.callCount++
	f.lastTag = tagName

	if f.err != nil {
		return nil, f.err
	}

	return append([]byte(nil), f.content...), nil
}

type fakeContainerController struct {
	restartErrs []error
	waitErrs    []error
	restarts    int
	waits       int
}

func (f *fakeContainerController) Restart(_ context.Context) error {
	f.restarts++
	return popFirstError(&f.restartErrs)
}

func (f *fakeContainerController) WaitReady(_ context.Context) error {
	f.waits++
	return popFirstError(&f.waitErrs)
}

func popFirstError(list *[]error) error {
	if len(*list) == 0 {
		return nil
	}

	err := (*list)[0]
	*list = (*list)[1:]

	return err
}

func TestDeploymentServiceDeployTagWritesAndRestarts(t *testing.T) {
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "nauthilus.yml")
	if err := os.WriteFile(targetPath, []byte("server:\n  instance_name: old\n"), 0o600); err != nil {
		t.Fatalf("failed to seed target file: %v", err)
	}

	fetcher := &fakeConfigFetcher{content: []byte("server:\n  instance_name: new\n")}
	container := &fakeContainerController{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service := NewDeploymentService(
		Config{TargetFile: targetPath, MaxConfigBytes: 1024},
		fetcher,
		container,
		logger,
	)

	if err := service.DeployTag(context.Background(), "v1.2.3"); err != nil {
		t.Fatalf("DeployTag returned error: %v", err)
	}

	got, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("failed to read target file: %v", err)
	}

	if string(got) != "server:\n  instance_name: new\n" {
		t.Fatalf("unexpected target content: %q", string(got))
	}

	if container.restarts != 1 || container.waits != 1 {
		t.Fatalf("unexpected container calls: restarts=%d waits=%d", container.restarts, container.waits)
	}

	if fetcher.callCount != 1 || fetcher.lastTag != "v1.2.3" {
		t.Fatalf("unexpected fetch calls: calls=%d tag=%q", fetcher.callCount, fetcher.lastTag)
	}
}

func TestDeploymentServiceDeployTagRollsBackAfterReadinessFailure(t *testing.T) {
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "nauthilus.yml")
	previous := []byte("server:\n  instance_name: stable\n")
	if err := os.WriteFile(targetPath, previous, 0o600); err != nil {
		t.Fatalf("failed to seed target file: %v", err)
	}

	fetcher := &fakeConfigFetcher{content: []byte("server:\n  instance_name: broken\n")}
	container := &fakeContainerController{
		waitErrs: []error{errors.New("container exited"), nil},
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service := NewDeploymentService(
		Config{TargetFile: targetPath, MaxConfigBytes: 1024},
		fetcher,
		container,
		logger,
	)

	err := service.DeployTag(context.Background(), "v1.2.3")
	if err == nil {
		t.Fatal("expected DeployTag to fail when readiness check fails")
	}

	if !strings.Contains(err.Error(), "container failed readiness check after restart") {
		t.Fatalf("unexpected DeployTag error: %v", err)
	}

	got, readErr := os.ReadFile(targetPath)
	if readErr != nil {
		t.Fatalf("failed to read target file: %v", readErr)
	}

	if !bytes.Equal(got, previous) {
		t.Fatalf("expected rollback to restore previous content, got %q", string(got))
	}

	if container.restarts != 2 || container.waits != 2 {
		t.Fatalf("expected restart+wait for deploy and rollback, got restarts=%d waits=%d", container.restarts, container.waits)
	}
}

func TestDeploymentServiceDeployTagFailsWhenRollbackHasNoPreviousConfig(t *testing.T) {
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "nauthilus.yml")

	fetcher := &fakeConfigFetcher{content: []byte("server:\n  instance_name: broken\n")}
	container := &fakeContainerController{
		waitErrs: []error{errors.New("container exited")},
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service := NewDeploymentService(
		Config{TargetFile: targetPath, MaxConfigBytes: 1024},
		fetcher,
		container,
		logger,
	)

	err := service.DeployTag(context.Background(), "v1.2.3")
	if err == nil {
		t.Fatal("expected DeployTag to fail")
	}

	if !strings.Contains(err.Error(), "rollback failed: no previous config file exists") {
		t.Fatalf("unexpected DeployTag error: %v", err)
	}

	if container.restarts != 1 || container.waits != 1 {
		t.Fatalf("unexpected container calls without rollback: restarts=%d waits=%d", container.restarts, container.waits)
	}
}

type fakeDeployer struct {
	lastTag string
	calls   int
	err     error
}

func (f *fakeDeployer) DeployTag(_ context.Context, tagName string) error {
	f.calls++
	f.lastTag = tagName

	return f.err
}

func TestWebhookHandlerDeploysAllowedTag(t *testing.T) {
	fake := &fakeDeployer{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := NewWebhookHandler("demo-secret", regexp.MustCompile(`^v\d+\.\d+\.\d+$`), fake, logger)

	body := []byte(`{"ref":"refs/tags/v1.2.3"}`)
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(string(body)))
	req.Header.Set("X-Gitea-Signature", signPayload("demo-secret", body))
	req.Header.Set("X-Gitea-Event", "push")

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status code: got %d, want %d", recorder.Code, http.StatusOK)
	}

	if fake.calls != 1 || fake.lastTag != "v1.2.3" {
		t.Fatalf("unexpected deploy calls: calls=%d tag=%q", fake.calls, fake.lastTag)
	}
}

func TestWebhookHandlerIgnoresNonTagRef(t *testing.T) {
	fake := &fakeDeployer{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := NewWebhookHandler("demo-secret", regexp.MustCompile(`^v\d+\.\d+\.\d+$`), fake, logger)

	body := []byte(`{"ref":"refs/heads/main"}`)
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(string(body)))
	req.Header.Set("X-Gitea-Signature", signPayload("demo-secret", body))
	req.Header.Set("X-Gitea-Event", "push")

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("unexpected status code: got %d, want %d", recorder.Code, http.StatusAccepted)
	}

	if fake.calls != 0 {
		t.Fatalf("deployer should not be called for non-tag refs, calls=%d", fake.calls)
	}
}

func TestWebhookHandlerIgnoresUnsupportedEventType(t *testing.T) {
	fake := &fakeDeployer{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := NewWebhookHandler("demo-secret", regexp.MustCompile(`^v\d+\.\d+\.\d+$`), fake, logger)

	body := []byte(`{"ref":"refs/tags/v1.2.3"}`)
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(string(body)))
	req.Header.Set("X-Gitea-Signature", signPayload("demo-secret", body))
	req.Header.Set("X-Gitea-Event", "create")

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("unexpected status code: got %d, want %d", recorder.Code, http.StatusAccepted)
	}

	if fake.calls != 0 {
		t.Fatalf("deployer should not be called for unsupported event type, calls=%d", fake.calls)
	}
}

func signPayload(secret string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)

	return hex.EncodeToString(mac.Sum(nil))
}
