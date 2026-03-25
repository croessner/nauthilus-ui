package proxy

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"nauthilus-ui/server/models"
	"nauthilus-ui/server/utils"
)

const (
	hookTesterMaxResponseBodyBytes = 1 * 1024 * 1024 // 1 MiB preview cap
	hookTesterRequestTimeout       = 30 * time.Second
)

var allowedHookTesterMethods = map[string]struct{}{
	http.MethodGet:     {},
	http.MethodPost:    {},
	http.MethodPut:     {},
	http.MethodPatch:   {},
	http.MethodDelete:  {},
	http.MethodHead:    {},
	http.MethodOptions: {},
}

var blockedHookTesterHeaders = map[string]struct{}{
	"authorization":        {},
	"proxy-authorization":  {},
	"cookie":               {},
	"set-cookie":           {},
	"host":                 {},
	"connection":           {},
	"content-length":       {},
	"transfer-encoding":    {},
	"x-auth-type":          {},
	"x-auth-value":         {},
	"x-csrf-token":         {},
	"x-target-url":         {},
	"x-endpoint-path":      {},
	"x-ssh-tunnel-enabled": {},
	"x-ssh-remote-target":  {},
	"x-ssh-remote-port":    {},
	"x-ssh-passphrase":     {},
}

type hookTesterKV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type hookTesterExecuteRequest struct {
	ProfileName  string         `json:"profileName"`
	Method       string         `json:"method"`
	EndpointPath string         `json:"endpointPath"`
	Query        []hookTesterKV `json:"query"`
	Headers      []hookTesterKV `json:"headers"`
	Body         string         `json:"body"`
	ContentType  string         `json:"contentType"`
}

type hookTesterHeaderPreview struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type hookTesterRequestPreview struct {
	Method       string                    `json:"method"`
	URL          string                    `json:"url"`
	EndpointPath string                    `json:"endpointPath"`
	Headers      []hookTesterHeaderPreview `json:"headers"`
}

type hookTesterResponsePreview struct {
	Status        int                       `json:"status"`
	StatusText    string                    `json:"statusText"`
	ContentType   string                    `json:"contentType,omitempty"`
	Headers       []hookTesterHeaderPreview `json:"headers"`
	Body          string                    `json:"body"`
	BodyTruncated bool                      `json:"bodyTruncated"`
	DurationMs    int64                     `json:"durationMs"`
}

type hookTesterExecuteResponse struct {
	Request  hookTesterRequestPreview  `json:"request"`
	Response hookTesterResponsePreview `json:"response"`
}

func normalizeHookTesterMethod(raw string) (string, bool) {
	method := strings.ToUpper(strings.TrimSpace(raw))
	_, ok := allowedHookTesterMethods[method]

	return method, ok
}

func methodSupportsBody(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

func normalizeHookTesterEndpointPath(raw string) (string, bool) {
	path := strings.TrimSpace(raw)
	if path == "" {
		return "", false
	}

	if !strings.HasPrefix(path, "/") {
		return "", false
	}

	if strings.Contains(path, "://") || strings.ContainsAny(path, "\r\n") {
		return "", false
	}

	return path, true
}

func normalizeOptionalHookTesterProfileName(raw string) (string, bool) {
	profileName := strings.TrimSpace(raw)
	if profileName == "" {
		return "", true
	}

	if strings.ContainsAny(profileName, "\r\n") {
		return "", false
	}

	return profileName, true
}

func mapString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}

	raw, ok := m[key]
	if !ok || raw == nil {
		return ""
	}

	value, ok := raw.(string)
	if !ok {
		return ""
	}

	return strings.TrimSpace(value)
}

func mapBool(m map[string]interface{}, key string) bool {
	if m == nil {
		return false
	}

	raw, ok := m[key]
	if !ok || raw == nil {
		return false
	}

	switch typed := raw.(type) {
	case bool:
		return typed
	case string:
		trimmed := strings.TrimSpace(strings.ToLower(typed))
		return trimmed == "true" || trimmed == "1"
	default:
		return false
	}
}

func mapObject(m map[string]interface{}, key string) map[string]interface{} {
	if m == nil {
		return nil
	}

	raw, ok := m[key]
	if !ok || raw == nil {
		return nil
	}

	return toStringAnyMap(raw)
}

func mapInt(m map[string]interface{}, key string) int {
	if m == nil {
		return 0
	}

	raw, ok := m[key]
	if !ok || raw == nil {
		return 0
	}

	switch typed := raw.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	case string:
		value, err := strconv.Atoi(strings.TrimSpace(typed))
		if err != nil {
			return 0
		}

		return value
	default:
		return 0
	}
}

func resolveRuntimeSSHTunnel(connection map[string]interface{}, passphrase string) (sshTunnelConfig, error) {
	sshTunnelRaw := mapObject(connection, "ssh_tunnel")
	if !mapBool(sshTunnelRaw, "enabled") {
		return sshTunnelConfig{}, nil
	}

	remoteTarget := mapString(sshTunnelRaw, "remote_target")
	if remoteTarget == "" {
		return sshTunnelConfig{}, errors.New("runtime ssh_tunnel.remote_target is required when enabled")
	}

	remotePort := mapInt(sshTunnelRaw, "remote_port")
	if remotePort < 1 || remotePort > 65535 {
		return sshTunnelConfig{}, errors.New("runtime ssh_tunnel.remote_port must be a valid TCP port")
	}

	if strings.ContainsAny(remoteTarget, "\r\n\t ") {
		return sshTunnelConfig{}, errors.New("runtime ssh_tunnel.remote_target contains invalid whitespace")
	}

	return sshTunnelConfig{
		Enabled:      true,
		RemoteTarget: remoteTarget,
		RemotePort:   remotePort,
		Passphrase:   passphrase,
	}, nil
}

func toStringAnyMap(raw interface{}) map[string]interface{} {
	switch typed := raw.(type) {
	case map[string]interface{}:
		return typed
	case bson.M:
		mapped := make(map[string]interface{}, len(typed))
		for key, value := range typed {
			mapped[key] = value
		}

		return mapped
	case bson.D:
		mapped := make(map[string]interface{}, len(typed))
		for _, element := range typed {
			mapped[element.Key] = element.Value
		}

		return mapped
	default:
		return nil
	}
}

func resolveRuntimeBackendAuth(connection map[string]interface{}) (backendURL, authType, authValue string, err error) {
	backendURL = mapString(connection, "backend_url")
	if backendURL == "" {
		return "", "", "", errors.New("no backend URL configured in Runtime > Connection")
	}

	parsed, parseErr := url.Parse(backendURL)
	if parseErr != nil {
		return "", "", "", errors.New("configured backend URL is invalid")
	}

	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	if scheme != "http" && scheme != "https" {
		return "", "", "", errors.New("configured backend URL must use http or https")
	}

	if strings.TrimSpace(parsed.Host) == "" {
		return "", "", "", errors.New("configured backend URL must include a host")
	}

	backendURL = parsed.String()

	basicAuth := mapObject(connection, "basic_auth")
	if mapBool(basicAuth, "enabled") {
		username := mapString(basicAuth, "username")
		password := mapString(basicAuth, "password")
		if username != "" && password != "" {
			authType = "basic"
			authValue = base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
		}
	}

	oidcAuth := mapObject(connection, "oidc_auth")
	if mapBool(oidcAuth, "enabled") {
		token := mapString(oidcAuth, "token")
		if token != "" {
			authType = "bearer"
			authValue = token
		}
	}

	return backendURL, authType, authValue, nil
}

func (h *ProxyHandler) loadRuntimeConnectionByProfile(ctx context.Context, username, profileName string) (map[string]interface{}, string, error) {
	if strings.TrimSpace(profileName) == "" {
		return nil, "", errors.New("no active profile configured")
	}

	var runtimeSettings models.RuntimeSettings
	runtimeErr := h.Mongo.RuntimeColl.FindOne(ctx, bson.M{
		"userId":      username,
		"profileName": profileName,
	}).Decode(&runtimeSettings)
	if runtimeErr != nil {
		if errors.Is(runtimeErr, mongo.ErrNoDocuments) {
			return nil, "", errors.New("no runtime settings configured for active profile")
		}

		return nil, "", runtimeErr
	}

	if runtimeSettings.Connection == nil {
		return nil, "", errors.New("no runtime connection configured for active profile")
	}

	return runtimeSettings.Connection, profileName, nil
}

func (h *ProxyHandler) loadActiveRuntimeConnection(ctx *gin.Context, requestedProfileName string) (map[string]interface{}, string, error) {
	username := strings.TrimSpace(ctx.GetString("username"))
	if username == "" {
		return nil, "", errors.New("authenticated user context missing")
	}

	profileName := strings.TrimSpace(requestedProfileName)

	if h.activeRuntimeConnectionLookup != nil {
		return h.activeRuntimeConnectionLookup(ctx.Request.Context(), username, profileName)
	}

	if h.Mongo == nil || !h.Mongo.IsConnectedToMongoDB() {
		return nil, "", errors.New("runtime storage unavailable")
	}

	if profileName != "" {
		return h.loadRuntimeConnectionByProfile(ctx.Request.Context(), username, profileName)
	}

	var profile models.Profile
	profileErr := h.Mongo.ProfileColl.FindOne(ctx.Request.Context(), bson.M{"userId": username}).Decode(&profile)
	if profileErr != nil {
		if errors.Is(profileErr, mongo.ErrNoDocuments) {
			return nil, "", errors.New("no active profile configured")
		}

		return nil, "", profileErr
	}

	profileName = strings.TrimSpace(profile.CurrentProfileName)
	if profileName == "" {
		return nil, "", errors.New("no active profile configured")
	}

	return h.loadRuntimeConnectionByProfile(ctx.Request.Context(), username, profileName)
}

func buildHookTesterHeaderPreview(headers http.Header) []hookTesterHeaderPreview {
	if len(headers) == 0 {
		return []hookTesterHeaderPreview{}
	}

	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, key)
	}

	sort.Slice(keys, func(i, j int) bool {
		return strings.ToLower(keys[i]) < strings.ToLower(keys[j])
	})

	preview := make([]hookTesterHeaderPreview, 0, len(headers))
	for _, key := range keys {
		values := headers.Values(key)
		if len(values) == 0 {
			continue
		}

		for _, value := range values {
			preview = append(preview, hookTesterHeaderPreview{
				Name:  key,
				Value: utils.RedactHeaderValue(key, value),
			})
		}
	}

	return preview
}

func readAllDecodedLimited(resp *http.Response, limit int64) ([]byte, bool, error) {
	reader, err := getDecodedBody(resp)
	if err != nil {
		return nil, false, err
	}

	defer func() {
		_ = reader.Close()
	}()

	limited := io.LimitReader(reader, limit+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, false, err
	}

	truncated := int64(len(body)) > limit
	if truncated {
		body = body[:limit]
	}

	return body, truncated, nil
}

func statusTextFromResponse(resp *http.Response) string {
	if resp == nil {
		return ""
	}

	return strings.TrimSpace(strings.TrimPrefix(resp.Status, strconv.Itoa(resp.StatusCode)))
}

func (h *ProxyHandler) HookExecuteProxy(ctx *gin.Context) {
	var payload hookTesterExecuteRequest
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request body"})
		return
	}

	method, ok := normalizeHookTesterMethod(payload.Method)
	if !ok {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Unsupported HTTP method"})
		return
	}

	endpointPath, ok := normalizeHookTesterEndpointPath(payload.EndpointPath)
	if !ok {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "endpointPath must start with '/' and be a valid relative path"})
		return
	}

	profileName, ok := normalizeOptionalHookTesterProfileName(payload.ProfileName)
	if !ok {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "profileName contains invalid control characters"})
		return
	}

	connection, profileName, err := h.loadActiveRuntimeConnection(ctx, profileName)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	targetBaseURL, authType, authValue, err := resolveRuntimeBackendAuth(connection)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	if !h.AllowPrivateTargets {
		if h.hasAllowedOriginLookup() {
			username := strings.TrimSpace(ctx.GetString("username"))
			origins, dbErr := h.getAllowedBackendOrigins(ctx.Request.Context(), username)
			if dbErr != nil {
				slog.Error("DB allowlist lookup failed, blocking hook tester request",
					"endpoint", "/proxy/hooks/execute",
					"username", username,
					"error", dbErr,
				)
				ctx.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "proxy allowlist lookup failed"})
				return
			}

			if !isOriginAllowed(targetBaseURL, origins) {
				ctx.JSON(http.StatusForbidden, models.ErrorResponse{
					Error: "proxy target is not in the configured backend allowlist",
				})
				return
			}
		} else if err := validateProxyTargetURL(targetBaseURL); err != nil {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
			return
		}
	}

	target, err := url.Parse(targetBaseURL)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Configured backend URL is invalid"})
		return
	}

	target.Path = endpointPath

	query := target.Query()
	for _, item := range payload.Query {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		if strings.ContainsAny(key, "\r\n") || strings.ContainsAny(item.Value, "\r\n") {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Query parameters contain invalid control characters"})
			return
		}

		query.Add(key, item.Value)
	}
	target.RawQuery = query.Encode()

	sshTunnel, sshTunnelErr := resolveRuntimeSSHTunnel(connection, ctx.GetHeader("x-ssh-passphrase"))
	if sshTunnelErr != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error": sshTunnelErr.Error(),
			"code":  "ssh_tunnel_invalid_runtime_config",
		})
		return
	}

	var bodyReader io.Reader
	if methodSupportsBody(method) && payload.Body != "" {
		bodyReader = strings.NewReader(payload.Body)
	}

	requestCtx, cancel := context.WithTimeout(ctx.Request.Context(), hookTesterRequestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, method, target.String(), bodyReader)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create backend request"})
		return
	}

	for _, item := range payload.Headers {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}

		if strings.ContainsAny(key, "\r\n") || strings.ContainsAny(item.Value, "\r\n") {
			ctx.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Request headers contain invalid control characters"})
			return
		}

		if _, blocked := blockedHookTesterHeaders[strings.ToLower(key)]; blocked {
			continue
		}

		req.Header.Set(key, item.Value)
	}

	if methodSupportsBody(method) {
		contentType := strings.TrimSpace(payload.ContentType)
		if contentType == "" {
			contentType = "application/json"
		}

		if req.Header.Get("Content-Type") == "" {
			req.Header.Set("Content-Type", contentType)
		}
	}

	if authType != "" && authValue != "" {
		utils.AddAuthorizationHeader(req, authType, authValue)
	}

	req.Header.Set("Accept-Encoding", "identity")

	transport, cleanupTransport, transportErr := h.buildTransportWithSSHTunnel(ctx, target, sshTunnel)
	if transportErr != nil {
		status, code, message := mapSSHTunnelError(transportErr)
		ctx.JSON(status, gin.H{
			"error": message,
			"code":  code,
		})
		return
	}
	defer cleanupTransport()

	client := &http.Client{
		Transport: transport,
		Timeout:   hookTesterRequestTimeout,
	}

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		h.writeAudit(ctx, ProxyConfig{LogEndpoint: "/proxy/hooks/execute"}, models.AuditLogEntry{
			Action: "hook.execute",
			Target: target.Scheme + "://" + target.Host + endpointPath,
			Details: map[string]any{
				"status":        http.StatusBadGateway,
				"http_method":   method,
				"endpoint":      "/proxy/hooks/execute",
				"endpoint_path": endpointPath,
				"query":         target.RawQuery,
				"profile_name":  profileName,
				"error":         err.Error(),
			},
		})
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Failed to connect to backend server: " + err.Error()})
		return
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	respBody, truncated, readErr := readAllDecodedLimited(resp, hookTesterMaxResponseBodyBytes)
	if readErr != nil {
		ctx.JSON(http.StatusBadGateway, models.ErrorResponse{Error: "Failed to read backend response"})
		return
	}

	durationMs := time.Since(start).Milliseconds()
	statusText := statusTextFromResponse(resp)
	if statusText == "" {
		statusText = http.StatusText(resp.StatusCode)
	}

	requestPreview := hookTesterRequestPreview{
		Method:       method,
		URL:          utils.RedactURLString(target.String()),
		EndpointPath: endpointPath,
		Headers:      buildHookTesterHeaderPreview(req.Header),
	}

	responsePreview := hookTesterResponsePreview{
		Status:        resp.StatusCode,
		StatusText:    statusText,
		ContentType:   strings.TrimSpace(resp.Header.Get("Content-Type")),
		Headers:       buildHookTesterHeaderPreview(resp.Header),
		Body:          string(respBody),
		BodyTruncated: truncated,
		DurationMs:    durationMs,
	}

	h.writeAudit(ctx, ProxyConfig{LogEndpoint: "/proxy/hooks/execute"}, models.AuditLogEntry{
		Action: "hook.execute",
		Target: target.Scheme + "://" + target.Host + endpointPath,
		Details: map[string]any{
			"status":           resp.StatusCode,
			"http_method":      method,
			"endpoint":         "/proxy/hooks/execute",
			"endpoint_path":    endpointPath,
			"query":            target.RawQuery,
			"profile_name":     profileName,
			"request_headers":  req.Header,
			"response_headers": resp.Header,
			"response_bytes":   len(respBody),
			"body_truncated":   truncated,
		},
	})

	ctx.JSON(http.StatusOK, hookTesterExecuteResponse{
		Request:  requestPreview,
		Response: responsePreview,
	})
}
