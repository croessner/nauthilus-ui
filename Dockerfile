# Build stage for React app
FROM node:24-alpine AS react-build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the code
COPY . .

# Build the React application
RUN npm run build

# Build stage for Go server
FROM golang:1.22-alpine AS go-build

# Add build arguments for multi-architecture support
ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN echo "Building on $BUILDPLATFORM for $TARGETPLATFORM"

# Install UPX for compression and Git for version info
RUN apk --no-cache add upx git

WORKDIR /app

# Copy Go module files
COPY server/go.mod server/go.sum ./

# Download dependencies
RUN go mod download

# Copy the Go source code
COPY server/ ./

# Copy .git directory for version info
COPY .git /app/.git

# Build the Go application with platform-specific settings
RUN GIT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0") && \
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") && \
    VERSION="$GIT_TAG-$GIT_COMMIT" && \
    case "$TARGETPLATFORM" in \
      "linux/amd64") GOARCH=amd64 ;; \
      "linux/arm64") GOARCH=arm64 ;; \
      "linux/arm/v7") GOARCH=arm GOARM=7 ;; \
      "linux/arm/v6") GOARCH=arm GOARM=6 ;; \
      "linux/386") GOARCH=386 ;; \
      *) GOARCH=amd64 ;; \
    esac && \
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -mod=vendor -ldflags="-s -w -X main.version=$VERSION" -o server . && \
    upx --best server

# Production stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy the build output from the React build stage
COPY --from=react-build /app/build ./build

# Copy the Go binary from the Go build stage
COPY --from=go-build /app/server ./

# Expose the server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/ || exit 1

# Run the Go server
CMD ["./server"]
