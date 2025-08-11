# Build stage for React app
FROM node:24-alpine AS react-build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (use install to align updated semver across Emotion packages)
RUN npm install

# Copy the rest of the code
COPY . .

# Build the React application
RUN npm run build

# Build stage for Go server
FROM golang:1.24-alpine AS go-build

# Add build arguments for multi-architecture support
ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN echo "[go-build] Building on $BUILDPLATFORM for $TARGETPLATFORM"

# Install UPX for compression and Git for version info
RUN apk --no-cache add upx git

WORKDIR /app

# Ensure React assets are built before starting Go build (prevents interleaved logs; Go build runs once)
# We copy a tiny file as a build marker to serialize stages without bloating layers
COPY --from=react-build /app/build/index.html /tmp/react-built-marker

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
    echo "[go-build] Starting go build for linux/${GOARCH}" && \
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -trimpath -mod=vendor -ldflags="-s -w -X main.version=$VERSION" -o server . && \
    echo "[go-build] Compressing binary with upx" && \
    upx --best server && \
    echo "[go-build] Build complete: version=${VERSION}, arch=${GOARCH}"

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
