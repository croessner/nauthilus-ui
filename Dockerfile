# Build stage for React app
ARG TARGETPLATFORM
ARG BUILDPLATFORM
FROM --platform=$BUILDPLATFORM node:24-alpine AS react-build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (use install to align updated semver across Emotion packages)
# Use legacy peer deps to avoid strict ERESOLVE failures in CI/build images
RUN npm install --legacy-peer-deps

# Copy the rest of the code
COPY . .

# Build the React application
RUN npm run build

# Build stage for Go server
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS go-build

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
      "linux/amd64") GOOS=linux GOARCH=amd64 ;; \
      "linux/arm64") GOOS=linux GOARCH=arm64 ;; \
      "linux/arm/v7") GOOS=linux GOARCH=arm GOARM=7 ;; \
      *) GOARCH=amd64 ;; \
    esac && \
    CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH go build -mod=vendor -ldflags="-s -w -X main.version=$VERSION" -o server . && \
    upx --best server

# Production stage
FROM alpine:3.22

WORKDIR /app

# Ensure community repository is enabled (chromium is in community)
RUN echo "https://dl-cdn.alpinelinux.org/alpine/v3.22/main" > /etc/apk/repositories \
 && echo "https://dl-cdn.alpinelinux.org/alpine/v3.22/community" >> /etc/apk/repositories

# Install ca-certificates for HTTPS and Chromium for server-side PDF rendering
RUN apk --no-cache add \
    ca-certificates \
    chromium \
    nss \
    freetype \
    ttf-freefont \
    tzdata

# Provide runtime defaults and a convenient symlink for tools that expect "chromium"
ENV NAUTHILUS_UI_INTEGRATIONS_REPORT_CHROME_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    TMPDIR=/tmp \
    XDG_RUNTIME_DIR=/tmp
RUN ln -sf /usr/bin/chromium-browser /usr/bin/chromium

# Copy the build output from the React build stage
COPY --from=react-build /app/build ./build

# Copy the Go binary from the Go build stage
COPY --from=go-build /app/server ./

# Expose the server port
EXPOSE 3001 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/ || exit 1

# Run the Go server
CMD ["./server"]
