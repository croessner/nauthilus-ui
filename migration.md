# Nauthilus UI Migration Plan

## Executive Summary

This document outlines the migration strategy for the Nauthilus UI from React + Material UI to HTMX + Tailwind CSS + DaisyUI, while adding OIDC Client Credentials Flow support for Nauthilus backend connections and removing deprecated Ory Hydra integration.

---

## Current State Analysis

### Technology Stack
- **Frontend**: React 19.1.1 with TypeScript
- **UI Framework**: Material UI (MUI) 7.3.2
- **Build Tool**: Vite 7.1.11
- **Backend Server**: Go (Gin framework)
- **Database**: MongoDB (6 collections: profiles, users, sessionconfig, runtime, legal, auditlog)
- **UI Authentication**: Opaque server-side sessions (username/password + MFA)
- **Backend Connection**: Basic Auth or JWT (needs OIDC Client Credentials support)

### Architecture: Multi-Profile System

**Critical**: The UI is a **multi-backend management tool**. Each profile represents:
- A distinct Nauthilus backend instance
- Separate configuration data (MongoDB `profiles` collection)
- Per-user runtime connection settings (MongoDB `runtime` collection, keyed by userId + profileName)

**Authentication Layers**:
1. **UI Layer**: User logs into nauthilus-ui (opaque session cookies, stays as-is)
2. **Backend Connection Layer**: nauthilus-ui → Nauthilus backend (currently Basic/JWT, needs OIDC support)

**Data Flow**:
```
User → UI Login (opaque session + MFA) → Profile Selection → Runtime Connection (Basic/OIDC) → Nauthilus Backend
```

**MongoDB Collections**:
- `profiles`: Nauthilus configurations per profile
- `runtime`: Connection settings (backend_url, auth) per user+profile
- `users`: UI user accounts (sessions, MFA)
- `sessionconfig`: UI session lifetime configuration
- `auditlog`: Audit trail
- `legal`: Legal documents

### Dependencies to Remove
- React, React-DOM, React Router
- Material UI, Emotion
- All React-specific tooling
- Ory Hydra references (`ory_hydra_admin_url`)

### Features to Preserve
- **Multi-profile management** (create, switch, rename, delete)
- **Per-profile runtime connection configuration** (stored in MongoDB, not server config)
- **UI authentication** (opaque sessions + MFA for UI login)
- **Backend connection options**: Basic Auth + OIDC Client Credentials (new)
- Configuration management (Server, Auth, LDAP, Redis, Features, Backends, etc.)
- Audit logging, user management
- Runtime pages (Clickhouse, distributed brute force tools, hook tester)

---

## Migration Strategy

5 phases, executed sequentially.

---

## Phase 1: Backend OIDC Support (No React Changes)

**Goal**: Add OIDC Client Credentials Flow as a runtime connection option, stored per profile in MongoDB.

### 1.1 Runtime Connection Data Model

**Location**: MongoDB `runtime` collection

**Current schema** (per userId + profileName):
```json
{
  "userId": "default-user",
  "profileName": "Production",
  "connection": {
    "backend_url": "https://nauthilus.example.com",
    "basic_auth": {
      "enabled": true,
      "username": "admin",
      "password": "secret"
    },
    "jwt_auth": {
      "enabled": false,
      "username": "",
      "password": "",
      "token": "",
      "refresh_token": "",
      "expires_at": 0
    }
  },
  "hooks": { ... }
}
```

**New schema** (replace JWT with OIDC):
```json
{
  "userId": "default-user",
  "profileName": "Production",
  "connection": {
    "backend_url": "https://nauthilus.example.com",
    "basic_auth": {
      "enabled": false,
      "username": "",
      "password": ""
    },
    "oidc": {
      "enabled": true,
      "discovery_url": "https://nauthilus.example.com/.well-known/openid-configuration",
      "client_id": "nauthilus-ui-client",
      "client_secret": "secret",
      "token_endpoint_auth_method": "client_secret_post",
      "scopes": ["nauthilus:admin", "nauthilus:authenticate"],
      "token": "",
      "expires_at": 0
    }
  },
  "hooks": { ... }
}
```

**Changes**:
- **Remove** `jwt_auth` (replaced by OIDC)
- **One** of `basic_auth` or `oidc` is enabled per profile
- OIDC config stored **per profile** in MongoDB, not in server config
- Token data stored alongside credentials (encrypted at rest recommended)
- **No `refresh_token`** (Client Credentials Flow doesn't use them)
- **Endpoints from discovery**: `token_endpoint`, `introspection_url`, etc. fetched from `/.well-known/openid-configuration`
- **Client authentication methods**: `client_secret_basic`, `client_secret_post`, or `private_key_jwt`
- **Scopes**: Use Nauthilus-specific scopes (e.g., `nauthilus:admin`, `nauthilus:authenticate`, `nauthilus:security`)

### 1.2 Go Backend - OIDC Client Package

**Location**: `server/auth/oidc_client.go` (new)

**Functionality**:
- Fetch OIDC discovery document (`.well-known/openid-configuration`) and cache endpoints:
  - `token_endpoint`
  - `introspection_endpoint`
  - `issuer`
  - `jwks_uri` (for JWT signature validation)
- Fetch and cache JWKS (JSON Web Key Set) from `jwks_uri`
- Perform client credentials flow with configurable auth method:
  - `client_secret_basic`: HTTP Basic Auth (client_id:client_secret in Authorization header)
  - `client_secret_post`: POST parameters (client_id and client_secret in body)
  - `private_key_jwt`: JWT signed with client's private key (RFC 7523)
- **Validate access token JWT signature** using JWKS before storing:
  - Verify signature with keys from `jwks_uri`
  - Validate `iss` (issuer) claim matches discovery document
  - Validate `exp` (expiry) claim
  - Validate `aud` (audience) claim if present
- Store validated access tokens in runtime connection data (MongoDB)
- Auto-refresh tokens before expiry (re-request with client credentials, no refresh token)
- Introspect tokens for additional validation using discovered `introspection_endpoint`

**Key functions**:
```go
func FetchOIDCToken(ctx context.Context, cfg OIDCConnectionConfig) (*TokenResponse, error)
func ValidateJWTSignature(ctx context.Context, token string, jwksURI string) error
func IntrospectToken(ctx context.Context, introspectionURL, token string) (*IntrospectionResponse, error)
```

**Note**: Client Credentials Flow does not use refresh tokens. To get a new token, re-authenticate with client credentials.

**Security**: Always validate JWT signatures using JWKS before trusting token claims.

### 1.3 Proxy Layer Enhancement

**Location**: `server/proxy/proxy.go`

**Current**: Proxies requests to Nauthilus backend with Basic Auth or JWT
**New**: Replace JWT with OIDC support

**Logic**:
```go
func ProxyRequestToNauthilus(w http.ResponseWriter, r *http.Request, runtimeConfig RuntimeConnectionConfig) {
    switch {
    case runtimeConfig.BasicAuth.Enabled:
        // Attach Basic Auth header
    case runtimeConfig.OIDC.Enabled:
        // Check token expiry, refresh if needed
        // Attach OIDC Bearer token
    }
    // Forward request to backend_url
}
```

### 1.4 Nauthilus OIDC Scopes

**Available Scopes** (from `nauthilus/server/definitions/const.go`):

**Backchannel API Scopes** (Client Credentials Flow):
- `nauthilus:admin` - Full administrative access to backchannel API
- `nauthilus:authenticate` - Base scope required for all backchannel API access
- `nauthilus:security` - Access to security features (metrics, brute force listing)
- `nauthilus:list_accounts` - Access to list-accounts mode

**Standard OIDC Scopes** (not used in Client Credentials Flow):
- `openid` - Mandatory for Authorization Code/Implicit flows
- `offline_access` - Enables refresh tokens (not used in Client Credentials)
- `profile`, `email`, `address` - User claims (not relevant for Client Credentials)

**Recommended Scopes for UI**:
- `nauthilus:admin` - For full config management access
- `nauthilus:authenticate` - Base access requirement

### 1.5 API Endpoints for OIDC

**Location**: `server/api/runtime.go` (modify existing)

**New endpoints**:
- `POST /api/runtime/:userId/:profileName/oidc/token` - Fetch OIDC token (manual trigger or auto)
- `GET /api/runtime/:userId/:profileName/oidc/status` - Check token validity
- `POST /api/runtime/:userId/:profileName/oidc/introspect` - Introspect current token

**Modify**:
- `GET /api/runtime/:userId/:profileName` - Return OIDC config (without secrets)
- `POST /api/runtime/:userId/:profileName` - Save OIDC config

### 1.6 Remove Ory Hydra References

**Files to modify**:
- `src/types/config.ts` - Remove `ory_hydra_admin_url` from ServerConfig
- `src/components/FrontendConfig.tsx` - Remove Ory Hydra admin URL field (lines 82-93, 148, 180, 190, 200, 529-536)
- `src/contexts/ConfigContext.tsx` - Remove from validation (line 424)
- TypeScript types: Remove `ory_hydra_admin_url` references

**Note**: This can be done in React now, before HTMX migration.

### 1.7 Testing

- Unit tests for OIDC client
- Integration tests: OIDC flow with real provider (Nauthilus)
- Manual testing: Create profile, configure OIDC, fetch token, make request
- Verify Basic Auth still works (backward compatibility)

**Deliverables**:
- ✅ OIDC support in runtime connection config (MongoDB)
- ✅ OIDC client implementation
- ✅ Proxy layer supports OIDC
- ✅ API endpoints for OIDC management
- ✅ Ory Hydra references removed
- ✅ Tests passing

---

## Phase 2: HTMX Infrastructure (Server-Side Foundation)

**Goal**: Build HTMX-compatible SSR infrastructure in Go backend.

### 2.1 Template Engine Setup

**Location**: `server/templates/`

**Structure**:
```
server/templates/
├── layouts/
│   ├── base.html          # Base layout (CSP nonce, CSRF token)
│   ├── authenticated.html # For logged-in users
│   └── public.html        # For login, legal pages
├── components/            # Reusable partials
│   ├── nav.html
│   ├── profile-selector.html
│   ├── form-field.html
│   ├── notification.html
│   └── modal.html
├── pages/                 # Full page templates
│   ├── login.html
│   ├── dashboard.html
│   ├── config/
│   │   ├── server.html
│   │   ├── connection.html
│   │   └── ... (all config pages)
│   ├── runtime/
│   │   ├── clickhouse.html
│   │   └── brute-force.html
│   └── user/
│       ├── profile.html
│       └── management.html
└── partials/             # HTMX response fragments
    ├── config-form.html
    ├── profile-list.html
    └── notification.html
```

**Template Engine**: Go's `html/template` with helpers for:
- CSP nonce injection: `{{.CSPNonce}}`
- CSRF token: `{{.CSRFToken}}`
- Current user: `{{.User}}`
- Current profile: `{{.CurrentProfile}}`
- Flash messages: `{{.FlashMessages}}`

### 2.2 Tailwind CSS + DaisyUI Setup

**Location**: `server/styles/`

**Files**:
- `tailwind.config.js`:
  ```javascript
  module.exports = {
    content: ["./templates/**/*.html", "./static/js/**/*.js"],
    plugins: [require("daisyui")],
    daisyui: {
      themes: ["light", "dark"],
    },
  }
  ```
- `input.css`:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  /* Custom styles */
  ```
- `package.json` (minimal, only for Tailwind build):
  ```json
  {
    "scripts": {
      "build:css": "tailwindcss -i input.css -o ../static/css/styles.css --minify",
      "watch:css": "tailwindcss -i input.css -o ../static/css/styles.css --watch"
    },
    "devDependencies": {
      "tailwindcss": "^3.4.0",
      "daisyui": "^4.12.0"
    }
  }
  ```

**Build integration**:
```makefile
# Makefile
build-css:
	cd server/styles && npm run build:css

build: build-css
	cd server && go build -o nauthilus-ui ./main.go
```

### 2.3 Static Assets

**Location**: `server/static/`

```
server/static/
├── css/
│   └── styles.css        # Tailwind output
├── js/
│   ├── htmx.min.js      # HTMX library
│   └── app.js           # Delegated event handlers
├── img/
│   └── ... (existing images)
```

### 2.4 HTMX Route Handlers

**Location**: `server/api/htmx_handlers.go` (new)

**Pattern**:
```go
func HandleConfigPage(c *gin.Context) {
    isHTMX := c.GetHeader("HX-Request") == "true"

    data := map[string]interface{}{
        "CSPNonce":       c.GetString("csp_nonce"),
        "CSRFToken":      c.GetString("csrf_token"),
        "User":           c.GetString("user"),
        "CurrentProfile": c.GetString("current_profile"),
        "Config":         loadConfigFromDB(c),
    }

    if isHTMX {
        // Return partial HTML
        c.HTML(http.StatusOK, "partials/config-form.html", data)
    } else {
        // Return full page
        c.HTML(http.StatusOK, "pages/config/server.html", data)
    }
}
```

### 2.5 Security Middleware

**Location**: `server/middleware/security.go` (new)

**CSP Nonce**:
```go
func CSPNonce() gin.HandlerFunc {
    return func(c *gin.Context) {
        nonce := generateNonce()
        c.Set("csp_nonce", nonce)
        csp := fmt.Sprintf("default-src 'self'; script-src 'self' 'nonce-%s'; style-src 'self' 'nonce-%s'", nonce, nonce)
        c.Header("Content-Security-Policy", csp)
        c.Next()
    }
}
```

**CSRF Protection**:
```go
func CSRFProtection() gin.HandlerFunc {
    return func(c *gin.Context) {
        if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "DELETE" {
            // Validate CSRF token from form or header
        }
        c.Next()
    }
}
```

### 2.6 Delegated Event Handlers

**Location**: `server/static/js/app.js`

```javascript
// Delegated events for HTMX interactions
document.addEventListener('click', (e) => {
  // Handle delete confirmations
  if (e.target.matches('[data-confirm]')) {
    if (!confirm(e.target.dataset.confirm)) {
      e.preventDefault();
    }
  }
});

// HTMX event listeners
document.body.addEventListener('htmx:beforeRequest', (e) => {
  // Show loading indicator
});

document.body.addEventListener('htmx:afterSwap', (e) => {
  // Hide loading indicator
  // Scroll to new content if needed
});
```

**Deliverables**:
- ✅ Template engine with layouts, components, pages
- ✅ Tailwind CSS + DaisyUI build pipeline
- ✅ HTMX route handlers pattern
- ✅ CSP nonce + CSRF middleware
- ✅ Delegated event handler system
- ✅ Static assets organized

---

## Phase 3: Page-by-Page Migration (React → HTMX)

**Goal**: Migrate all pages incrementally, starting with simplest.

### 3.1 Migration Order

**Static Pages**
1. Legal page
2. Licenses page
3. Error pages

**Authentication Pages**
4. Login page (username/password)
5. MFA page (TOTP, WebAuthn)

**User Pages**
6. User profile
7. User management
8. MFA settings

**Connection & Runtime**
9. Connection config (with OIDC fields)
10. Profile management (create, switch, rename, delete)

**Simple Config Pages**
11. Server config
12. LDAP config
13. Redis config
14. Monitoring config

**Complex Config Pages**
15. Features config (arrays)
16. Backends config (arrays)
17. Auth config (nested)
18. Brute force config

**Advanced Config Pages**
19. Lua config (code editor)
20. Frontend config

**Runtime & Advanced Pages**
21. Config preview (YAML)
22. Config wizard (multi-step)
23. Audit log (tables, pagination)
24. Clickhouse runtime
25. Distributed brute force tools
26. Hook tester

**Dashboard & Navigation**
27. Main app layout
28. Navigation (with profile selector)
29. Dashboard

### 3.2 Per-Page Migration Process

For each page:

#### A. Analyze React Component
- Map state to server-side data
- Identify API calls → HTMX endpoints
- Identify form validation → Go validation
- Identify dynamic UI → HTMX swaps

#### B. Create HTML Template

**Example**: Connection Config (React → HTMX)

React (before):
```tsx
<Button
  variant="contained"
  onClick={handleSubmit}
>
  Save
</Button>
```

HTMX (after):
```html
<button
  class="btn btn-primary"
  hx-post="/api/config/connection"
  hx-include="[name='csrf_token']"
  hx-target="#notification"
  hx-swap="innerHTML"
>
  Save
</button>
```

**MUI → DaisyUI Mapping**:
| MUI | DaisyUI |
|-----|---------|
| `<Button variant="contained">` | `<button class="btn btn-primary">` |
| `<TextField>` | `<input class="input input-bordered">` |
| `<Switch>` | `<input type="checkbox" class="toggle">` |
| `<Select>` | `<select class="select select-bordered">` |
| `<Dialog>` | `<dialog class="modal">` |
| `<Card>` | `<div class="card bg-base-100 shadow-xl">` |
| `<Alert>` | `<div class="alert alert-success">` |

#### C. Create Go Handler

**Example**: Connection config with OIDC

```go
func HandleConnectionConfigSave(c *gin.Context) {
    var form struct {
        BackendURL string `form:"backend_url" binding:"required,url"`
        AuthMethod string `form:"auth_method" binding:"required,oneof=basic jwt oidc"`

        // Basic Auth
        BasicUsername string `form:"basic_username"`
        BasicPassword string `form:"basic_password"`

        // OIDC
        OIDCDiscoveryURL string `form:"oidc_discovery_url"`
        OIDCClientID     string `form:"oidc_client_id"`
        OIDCClientSecret string `form:"oidc_client_secret"`
        OIDCScopes       string `form:"oidc_scopes"`
    }

    if err := c.ShouldBind(&form); err != nil {
        c.HTML(http.StatusBadRequest, "partials/notification.html", map[string]interface{}{
            "Type":    "error",
            "Message": err.Error(),
        })
        return
    }

    // Save to MongoDB runtime collection
    userId := c.GetString("user_id")
    profileName := c.GetString("current_profile")

    // Build connection config based on auth method
    connectionConfig := buildConnectionConfig(form)

    // Save to DB
    err := saveRuntimeConnection(userId, profileName, connectionConfig)
    if err != nil {
        c.HTML(http.StatusInternalServerError, "partials/notification.html", map[string]interface{}{
            "Type":    "error",
            "Message": "Failed to save connection config",
        })
        return
    }

    c.HTML(http.StatusOK, "partials/notification.html", map[string]interface{}{
        "Type":    "success",
        "Message": "Connection settings saved successfully",
    })
}
```

#### D. Form Validation (Yup → Go)

React (before):
```tsx
const schema = Yup.object().shape({
  backend_url: Yup.string().required().url(),
  oidc_client_id: Yup.string().when('auth_method', {
    is: 'oidc',
    then: schema => schema.required(),
  }),
});
```

Go (after):
```go
import "github.com/go-playground/validator/v10"

type ConnectionForm struct {
    BackendURL      string `validate:"required,url"`
    AuthMethod      string `validate:"required,oneof=basic jwt oidc"`
    OIDCClientID    string `validate:"required_if=AuthMethod oidc"`
    OIDCClientSecret string `validate:"required_if=AuthMethod oidc"`
}

func ValidateConnectionForm(form ConnectionForm) []string {
    validate := validator.New()
    err := validate.Struct(form)
    if err != nil {
        var errors []string
        for _, err := range err.(validator.ValidationErrors) {
            errors = append(errors, err.Field() + ": " + err.Tag())
        }
        return errors
    }
    return nil
}
```

#### E. Profile Selector (Critical Component)

**Location**: `server/templates/components/profile-selector.html`

```html
<div class="dropdown dropdown-end">
  <label tabindex="0" class="btn btn-ghost">
    {{.CurrentProfile}} ▼
  </label>
  <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52">
    {{range .Profiles}}
      <li>
        <a hx-post="/api/profiles/switch/{{.Name}}"
           hx-swap="none"
           hx-on="htmx:afterRequest: window.location.reload()">
          {{.Name}}
        </a>
      </li>
    {{end}}
    <li class="divider"></li>
    <li><a hx-get="/api/profiles/create" hx-target="#modal-content">Create New Profile</a></li>
  </ul>
</div>
```

**Handler**:
```go
func HandleProfileSwitch(c *gin.Context) {
    profileName := c.Param("name")
    userId := c.GetString("user_id")

    // Update session with new profile
    session := sessions.Default(c)
    session.Set("current_profile", profileName)
    session.Save()

    // Load runtime settings for new profile
    loadRuntimeSettings(userId, profileName)

    c.Status(http.StatusOK)
}
```

#### F. Testing Each Page

- Visual comparison with React version
- Functionality testing (forms, buttons, modals)
- HTMX requests/responses
- Validation error display

#### G. Remove React Component

Once HTMX version works:
```bash
rm src/components/ConnectionConfig.tsx
# Update router to remove route
```

**Deliverables** (per page):
- ✅ HTML template (Tailwind + DaisyUI)
- ✅ Go handler (render + mutations)
- ✅ Validation in Go
- ✅ Tests passing
- ✅ React component deleted

---

## Phase 4: Frontend Cleanup

**Goal**: Remove all React dependencies and artifacts.

### 4.1 Remove Dependencies

**Delete** from `package.json`:
```json
{
  "dependencies": {
    "@emotion/react",
    "@emotion/styled",
    "@mui/icons-material",
    "@mui/material",
    "react",
    "react-dom",
    "react-router-dom",
    "formik",
    "yup",
    "recharts",
    // ... all React packages
  }
}
```

**Keep** (minimal):
```json
{
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "daisyui": "^4.12.0"
  }
}
```

### 4.2 Delete React Source

```bash
rm -rf src/
rm vite.config.ts
rm tsconfig.json
rm webpack.config.js
rm config-overrides.js
```

### 4.3 Update Build

**New `Makefile`**:
```makefile
.PHONY: build-css build run

build-css:
	cd server/styles && npm run build:css

build: build-css
	cd server && go build -o nauthilus-ui ./main.go

run: build
	cd server && ./nauthilus-ui
```

### 4.4 Update Dockerfile

```dockerfile
# Stage 1: Build Tailwind CSS
FROM node:20-alpine AS css-builder
WORKDIR /app
COPY server/styles/package*.json ./
RUN npm ci
COPY server/styles ./
RUN npm run build:css

# Stage 2: Build Go binary
FROM golang:1.23-alpine AS go-builder
WORKDIR /app
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=css-builder /app/static/css/styles.css ./static/css/
RUN go build -o nauthilus-ui ./main.go

# Stage 3: Runtime
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=go-builder /app/nauthilus-ui ./
COPY --from=go-builder /app/static ./static
COPY --from=go-builder /app/templates ./templates
EXPOSE 8080
CMD ["./nauthilus-ui"]
```

### 4.5 Update Documentation

- `README.md`: New tech stack, setup instructions
- Remove React references
- Add HTMX + Tailwind setup guide

**Deliverables**:
- ✅ React dependencies removed
- ✅ React source files deleted
- ✅ Build configuration simplified
- ✅ Dockerfile optimized
- ✅ Documentation updated

---

## Phase 5: Testing & Deployment

**Goal**: Comprehensive testing, security audit, production deployment.

### 5.1 Functional Testing

**Manual Test Checklist**:
- [ ] UI login (username/password, MFA)
- [ ] Profile management (create, switch, rename, delete)
- [ ] Connection config (Basic Auth, OIDC)
- [ ] OIDC token fetch and refresh
- [ ] All configuration pages (save, load, validate)
- [ ] Configuration preview/export
- [ ] User management (CRUD)
- [ ] Audit log
- [ ] Runtime pages (Clickhouse, brute force tools, hook tester)
- [ ] Responsive design (mobile, tablet, desktop)

### 5.2 Security Audit

**OWASP Top 10 Review**:
- [ ] A01: Broken Access Control - Verify profile isolation, JWT validation
- [ ] A02: Cryptographic Failures - Check HTTPS, secure cookies, MongoDB encryption
- [ ] A03: Injection - Test for XSS (CSP nonce), NoSQL injection
- [ ] A05: Security Misconfiguration - CSP headers, TLS config
- [ ] A07: Identification/Authentication - Test UI login, MFA, OIDC flow
- [ ] A08: Software/Data Integrity - CSRF protection

**CSP Testing**:
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{RANDOM}';
  style-src 'self' 'nonce-{RANDOM}';
  img-src 'self' data:;
  connect-src 'self';
```

- [ ] No CSP violations in console
- [ ] All inline scripts have valid nonce

**CSRF Testing**:
- [ ] All POST/PUT/DELETE require CSRF token
- [ ] Token validation on server-side

### 5.3 Performance Testing

**Frontend**:
- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] CSS bundle < 50KB (Tailwind purged)
- [ ] JS bundle < 30KB

**Backend**:
- [ ] Template rendering < 50ms
- [ ] Database queries < 100ms
- [ ] Load test: 100 concurrent users

### 5.4 Accessibility

- [ ] WCAG 2.1 AA compliance
- [ ] Keyboard navigation
- [ ] Screen reader compatible
- [ ] Focus indicators visible
- [ ] Color contrast meets standards

### 5.5 Deployment

**Staging**:
1. Deploy to staging
2. Run full test suite
3. UAT with stakeholders

**Production**:
- Blue-green deployment (zero downtime)
- Monitor error rates, response times
- Rollback plan ready

**Deliverables**:
- ✅ All tests passing
- ✅ Security audit complete
- ✅ Performance benchmarks met
- ✅ Deployed to production
- ✅ Monitoring active

---

## Risk Management

| Risk | Impact | Mitigation |
|------|--------|------------|
| OIDC integration issues | High | Early testing with real Nauthilus backend |
| MongoDB performance with many profiles | Medium | Indexing, query optimization |
| Complex pages hard to migrate (Lua editor, Clickhouse) | Medium | Start simple, establish patterns |
| Security vulnerabilities (CSP, CSRF) | High | Security review each phase, automated scanning |
| Profile isolation bugs | High | Thorough testing, audit MongoDB queries |

---

## Success Criteria

- ✅ Zero React dependencies
- ✅ OIDC Client Credentials support for Nauthilus backends
- ✅ All functionality preserved (multi-profile, runtime config, UI auth)
- ✅ CSP nonce + CSRF protection
- ✅ Performance > React version (faster page loads)
- ✅ Security tests passing
- ✅ Accessibility WCAG 2.1 AA
- ✅ Lighthouse score > 90

---

## Appendix

### A. Key Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| Go | 1.23+ | Backend server |
| Gin | 1.9+ | Web framework |
| MongoDB | 6.0+ | Database (profiles, runtime, users) |
| HTMX | 2.x | Dynamic HTML |
| Tailwind CSS | 3.x | Utility CSS |
| DaisyUI | 4.x | Component library |
| html/template | stdlib | Go templating |

### B. File Structure (Post-Migration)

```
nauthilus-ui/
├── server/
│   ├── api/              # HTMX handlers, profile, runtime, user APIs
│   ├── auth/             # OIDC client (optional, for Nauthilus connection)
│   ├── config/           # Server config
│   ├── db/               # MongoDB (profiles, runtime, users)
│   ├── middleware/       # CSP, CSRF, session, auth
│   ├── templates/        # HTML templates
│   ├── static/           # CSS, JS, images
│   ├── styles/           # Tailwind source
│   ├── main.go
│   ├── go.mod
│   └── go.sum
├── docs/
├── Dockerfile
├── Makefile
├── migration.md
└── README.md
```

### C. OIDC Configuration Example (Runtime)

Stored per user+profile in MongoDB `runtime` collection:

```json
{
  "userId": "admin",
  "profileName": "Production Nauthilus",
  "connection": {
    "backend_url": "https://nauthilus.example.com",
    "basic_auth": { "enabled": false },
    "oidc": {
      "enabled": true,
      "discovery_url": "https://nauthilus.example.com/.well-known/openid-configuration",
      "client_id": "nauthilus-ui",
      "client_secret": "secret123",
      "token_endpoint_auth_method": "client_secret_post",
      "scopes": ["nauthilus:admin", "nauthilus:authenticate"],
      "token": "eyJhbGc...",
      "expires_at": 1234567890
    }
  }
}
```

---

## Conclusion

This migration plan addresses the multi-profile architecture, adds OIDC support for Nauthilus backend connections (stored per profile in MongoDB), removes Ory Hydra, and migrates to HTMX + Tailwind.

**Key Principles**:
1. **Profile isolation**: Each profile = separate Nauthilus backend with its own connection config
2. **No server config for OIDC**: All connection settings in MongoDB `runtime` collection
3. **UI auth unchanged**: Opaque sessions + MFA for UI login stay as-is
4. **Incremental migration**: Phase-by-phase, test continuously
5. **Security-first**: CSP, CSRF, encrypted tokens

**Next Steps**:
1. Review and approve plan
2. Start Phase 1: Add OIDC support to runtime connection config
3. Remove Ory Hydra references
4. Begin HTMX infrastructure (Phase 2)
