# Makefile for nauthilus-ui

.PHONY: all build clean lint fmt test

# Default target
all: lint fmt build

# Build the application
build:
	@echo "Building nauthilus-ui..."
	cd server && go build -o ../bin/nauthilus-ui

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/

# Run golangci-lint
lint:
	@echo "Running golangci-lint..."
	golangci-lint run ./server/...

# Format Go code
fmt:
	@echo "Formatting Go code..."
	cd server && go fmt ./...

# Run tests
test:
	@echo "Running tests..."
	cd server && go test -v ./...

# Install golangci-lint if not already installed
install-lint:
	@echo "Installing golangci-lint..."
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin v1.55.2

# Help target
help:
	@echo "Available targets:"
	@echo "  all          - Run lint, fmt, and build"
	@echo "  build        - Build the application"
	@echo "  clean        - Clean build artifacts"
	@echo "  lint         - Run golangci-lint"
	@echo "  fmt          - Format Go code"
	@echo "  test         - Run tests"
	@echo "  install-lint - Install golangci-lint"
	@echo "  help         - Show this help message"
