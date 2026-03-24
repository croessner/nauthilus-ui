# Nauthilus Configuration UI

A standalone web-based configuration builder for the Nauthilus authentication server.

> **⚠️ IMPORTANT**: This application uses a Go-based API server to handle backend operations. The React frontend communicates with this Go server. See the [Getting Started](#getting-started) section for details.

## Overview

This UI provides a user-friendly way to create and edit Nauthilus configuration files without having to edit YAML files manually. It's built with React, TypeScript, and Material-UI, and works completely independently from the Nauthilus service.

## Features

- **Standalone Operation**: Works independently without requiring the Nauthilus service
- **User Authentication**: Secure login system with user management capabilities
- **File Upload/Download**: Upload existing nauthilus.yml files for editing and download the resulting configuration
- **Dark Mode Support**: Toggle between light and dark themes for comfortable viewing in any environment
- **Responsive Design**: Works on desktop and mobile devices
- **Form Validation**: Validates configuration values before submission
- **Real-time Feedback**: Shows loading states and error messages
- **Modular Architecture**: Easy to extend with new configuration sections
- **Branded Interface**: Includes the Nauthilus logo in the header and sidebar

## Project Structure

```
ui/
├── public/              # Static files
├── src/                 # Source code
│   ├── api/             # API integration
│   ├── components/      # React components
│   │   ├── common/      # Shared components
│   │   └── ...          # Configuration section components
│   ├── contexts/        # React contexts
│   ├── types/           # TypeScript interfaces
│   ├── App.tsx          # Main application component
│   └── index.tsx        # Entry point
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Getting Started

### Prerequisites

- Go 1.25 or higher (for the API server)
- Node.js 14.x or higher (for building the React frontend)
- npm 6.x or higher (for building the React frontend)
- MongoDB 4.x or higher

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/croessner/nauthilus.git
   cd nauthilus/ui
   ```

2. Install dependencies:
   ```
   npm install
   ```

> Note: The frontend now uses Vite for development/build instead of Create React App.

3. The UI now uses the Nauthilus logo from the `/img` directory. If you want to use custom logo files, you can:
   - Create or copy a favicon.ico file to `public/favicon.ico`
   - Add logo192.png (192x192 pixels) to `public/logo192.png`
   - Add logo512.png (512x512 pixels) to `public/logo512.png`

   These files are referenced in the manifest.json and index.html files.

4. Configure MongoDB connection in the `.env` file:
   ```
   MONGODB_URI=mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
   ```

5. For development:

   a. Start the Vite development server:
   ```
   npm run dev
   ```

   b. In a separate terminal, start the Go API server:
   ```
   cd server
   go run .
   ```

   The Vite dev server runs on port 3000 and proxies requests to the Go API server on port 3001 (configurable via FRONTEND_ADDRESS/FRONTEND_PORT in your .env).

   c. Development Mode Architecture:
   - Vite's dev server proxies API requests to the Go backend (see vite.config.ts)
   - The earlier CRA-specific `src/setupProxy.js` is no longer used by the dev server
   - The Go backend only allows cross-origin requests from an explicit allowlist
   - If `CORS_ALLOWED_ORIGINS` is unset, only local dev origins on `localhost`/`127.0.0.1` for ports `3000`, `3001`, and `3002` are allowed
   - `Forwarded` / `X-Forwarded-*` headers are ignored unless the reverse proxy IP/CIDR is listed in `TRUSTED_PROXIES`
   - In production, the Go server serves the built static files from the `build/` directory and provides runtime configuration via `/env-config.js`

6. For production deployment, use Docker Compose:
   ```
   docker-compose up -d
   ```

   This will build and start the entire application stack including the Go API server and MongoDB.

7. For multi-architecture builds (cross-compilation), use Docker Buildx:
   ```
   # Set up Docker Buildx builder if you haven't already
   docker buildx create --name mybuilder --use

   # Build and push multi-architecture images using the bake file
   docker buildx bake --push
   ```

   This will build images for multiple architectures (amd64, arm64, armv7, armv6, 386) using the configuration in `docker-bake.hcl`.

   You can also build for specific platforms:
   ```
   # Build only for specific platforms
   docker buildx bake --set "*.platform=linux/amd64,linux/arm64" --push
   ```

   To build without pushing to a registry (for local testing):
   ```
   # Build without pushing (load to local Docker)
   docker buildx bake --set "*.platform=linux/amd64" --load
   ```

   Note: The `--load` flag only works with a single platform. For multi-platform builds, you must use `--push`.

8. Alternatively, build the React frontend for production:
   ```
   npm run build
   ```

## Development Tools

### Code Linting

The project uses [golangci-lint](https://golangci-lint.run/) for Go code linting. This is a fast, parallel runner for many Go linters that ensures code quality and consistency.

#### Setup

1. Install golangci-lint:
   ```
   make install-lint
   ```

   Or manually:
   ```
   curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin v1.55.2
   ```

2. Run the linter:
   ```
   make lint
   ```

3. Format the code:
   ```
   make fmt
   ```

The linter configuration is in `.golangci.yml` at the root of the project. It includes settings for various linters and rules for code quality.

#### Available Make Commands

The project includes a Makefile with several useful commands:

- `make all` - Run lint, fmt, and build
- `make build` - Build the application
- `make clean` - Clean build artifacts
- `make lint` - Run golangci-lint
- `make fmt` - Format Go code
- `make test` - Run tests
- `make install-lint` - Install golangci-lint
- `make help` - Show help message

## Configuration

The UI works completely independently from the Nauthilus service. Configuration data is stored in MongoDB, and you can upload and download configuration files as needed. User session state is stored server-side and bound to HttpOnly cookies.

### User Authentication

The UI includes a user authentication system that is completely independent from the Nauthilus service:

- **Login Required**: Users must log in to access the application
- **Default Admin**: A default admin user is created on first run
- **User Management**: Admins can add, edit, and delete users
- **Role-Based Access**: Users can have different roles (admin, user)
- **Session Authentication**: Secure opaque server-side sessions via HttpOnly cookies

#### Default Admin Credentials

The application uses a default admin user with the following credentials:
- Username: `admin`
- Password: `admin`

After logging in for the first time, it's recommended to change the password using the User Management section.

#### Session Configuration

You can configure session lifetimes using environment variables:

```
REACT_APP_TOKEN_EXPIRY=3600
REACT_APP_REFRESH_TOKEN_EXPIRY=86400
REACT_APP_REMEMBER_ME_EXPIRY=86400
```

#### WebAuthn Configuration

You can configure WebAuthn settings using environment variables:

```
WEBAUTHN_RP_ID=your_domain.com
WEBAUTHN_RP_DISPLAY_NAME=Your Application Name
WEBAUTHN_RP_ORIGINS=https://your_domain.com
```

- `WEBAUTHN_RP_ID`: The Relying Party ID for WebAuthn (usually your domain name). If not set, the application will try to auto-detect it from the `FRONTEND_ADDRESS` environment variable, falling back to "localhost" if it can't determine the domain.
- `WEBAUTHN_RP_DISPLAY_NAME`: The display name for your application shown during WebAuthn registration. Defaults to "Nauthilus UI" if not set.
- `WEBAUTHN_RP_ORIGINS`: The allowed origins for WebAuthn operations (comma-separated list). If not set, the application will use default origins based on the RPID: for "localhost", it will use "http://localhost:3000" and "http://localhost:3001"; for other domains, it will use "https://<domain>".

#### User Management

The User Management section in the application allows administrators to:

- View all users
- Add new users
- Change user passwords
- Delete users
- Assign roles to users

This user management system is completely separate from the Nauthilus authentication service and is only used for accessing the UI itself.

### File Upload/Download

The UI provides buttons in the top bar for:

- **Upload**: Upload an existing nauthilus.yml or JSON configuration file
- **Download**: Download the current configuration as a nauthilus.yml file
- **Reset**: Reset the configuration to default values

### Persistent Storage

- Configuration data is stored in MongoDB
- User session state is stored server-side and bound to HttpOnly cookies
- MongoDB provides reliable server-side storage
- Configuration persists even if the browser data is cleared
- The Go API server provides endpoints to interact with MongoDB

### Backend Health Check

- The Go API server includes health check endpoints
- The `/api/health` endpoint checks the overall API server health
- The `/api/health/mongodb` endpoint checks the MongoDB connection
- This allows the UI to check connectivity to the backend and database

### Go API Server

- The application uses a Go-based API server built with the Gin framework
- The Go server handles all backend operations including:
  - API endpoints for configuration management
  - MongoDB database interactions
  - User authentication and server-side session management
  - Health checks and monitoring
- In development mode, the Go server runs separately from the React development server
  - Cross-origin requests are allowed only for the configured CORS allowlist
  - If `CORS_ALLOWED_ORIGINS` is unset, only local dev origins on `localhost`/`127.0.0.1` for ports `3000`, `3001`, and `3002` are allowed
  - In non-local deployments, set `CORS_ALLOWED_ORIGINS` explicitly to the UI origin(s)
  - Cookie-authenticated mutating requests require Origin/Referer validation plus a double-submit CSRF token (`X-CSRF-Token` + `nauthilus_ui_csrf_token`)
- In production, the Docker setup includes:
  - A Go API server container that serves both the static React files and handles API requests
  - A MongoDB container for data storage

### Supported File Formats

The UI supports uploading configuration files in the following formats:
- YAML (.yml, .yaml)
- JSON (.json)

When downloading, the configuration is always saved as a YAML file (nauthilus.yml).

### Dark Mode

The UI supports both light and dark themes:

- A theme toggle button is available in the top bar (moon/sun icon)
- Your theme preference is automatically saved in the browser's localStorage (this is the only setting that still uses localStorage)
- The theme setting persists between browser sessions
- Dark mode reduces eye strain in low-light environments

### Address Format Requirements

When configuring server addresses in the UI:

- All address fields must be specified as a valid IPv4 or IPv6 address with a port number
- IPv4 format: `127.0.0.1:8080` (IP address followed by colon and port number)
- IPv6 format: `[::1]:8080` (IPv6 address in square brackets followed by colon and port number)
- Hostname format like `localhost:8080` is not supported - use the IP address instead
- This applies to the server address in the Server Configuration section and other address fields

## Extending the UI

### Adding a New Configuration Section

1. Create a new component in the `src/components` directory:
   ```tsx
   // src/components/NewConfig.tsx
   import React from 'react';
   import { Formik, Form, Field } from 'formik';
   import * as Yup from 'yup';
   import { TextField, Grid, Button, Box } from '@mui/material';
   import { useConfig } from '../contexts/ConfigContext';
   import FormSection from './common/FormSection';

   const NewConfigSchema = Yup.object().shape({
     // Define validation schema
   });

   const NewConfig: React.FC = () => {
     const { config, updateConfigSection } = useConfig();

     if (!config) {
       return null;
     }

     const initialValues = {
       // Initialize from config
     };

     const handleSubmit = async (values: any) => {
       try {
         await updateConfigSection('new_section', values);
       } catch (error) {
         console.error('Error updating configuration:', error);
       }
     };

     return (
       <Formik
         initialValues={initialValues}
         validationSchema={NewConfigSchema}
         onSubmit={handleSubmit}
         enableReinitialize
       >
         {({ errors, touched }) => (
           <Form>
             <FormSection
               title="New Configuration"
               description="Configure new settings."
             >
               <Grid container spacing={3}>
                 {/* Add form fields */}
               </Grid>
             </FormSection>

             <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
               <Button type="submit" variant="contained" color="primary">
                 Save Changes
               </Button>
             </Box>
           </Form>
         )}
       </Formik>
     );
   };

   export default NewConfig;
   ```

2. Add the component to the routes in `App.tsx`:
   ```tsx
   import NewConfig from './components/NewConfig';

   // ...

   <Routes>
     {/* ... */}
     <Route path="/new" element={<NewConfig />} />
   </Routes>
   ```

3. Add a menu item for the new section:
   ```tsx
   const menuItems: MenuItem[] = [
     // ...
     { text: 'New Section', icon: <NewIcon />, path: '/new' },
   ];
   ```

## Troubleshooting

### Connection Errors

If you see errors like these in the console:

```
Failed to fetch: TypeError: Failed to fetch
GET http://localhost:3001/api/health 404 (Not Found)
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

**Solution**: The Go API server is not running or is not accessible. Make sure to start the Go server with `cd server && go run .` in development mode, or ensure the API container is running in Docker (`docker-compose ps`).

### CORS Errors

If you see errors like these in the console:

```
Access to fetch at 'http://localhost:3001/api/health' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Solution**:
1. Check that the browser origin is included in `CORS_ALLOWED_ORIGINS`, or use the local dev defaults (`localhost`/`127.0.0.1` on ports `3000`, `3001`, `3002`)
2. Check that the CORS middleware is properly registered in the Go server
3. Verify that the React development server is correctly proxying requests to the Go server
4. If you deploy behind a reverse proxy or TLS terminator, configure the final browser-facing origin explicitly in `CORS_ALLOWED_ORIGINS`

### MongoDB Connection Issues

If you see errors related to MongoDB connection:

```
MongoDB connection error: MongoNetworkError: failed to connect to server
```

**Solution**: 
1. Make sure MongoDB is installed and running on your system
2. Check that the MongoDB connection string in your `.env` file is correct
3. Verify that the MongoDB user has the correct permissions

### No MongoDB Collections Created

If the application starts but no collections are created in MongoDB:

**Solution**:
1. Make sure the Go API server is running
2. Check the MongoDB connection string in your `.env` file
3. Verify that the MongoDB user has write permissions to create collections
4. Try accessing the MongoDB health check endpoint at `/api/health/mongodb` to trigger a reconnection
5. Check the Go server logs for any MongoDB connection errors

## License

This project is proprietary software.

# Nauthilus UI

[... existing content omitted for brevity ...]

## Optional Google reCAPTCHA (adaptive)

The backend can optionally require Google reCAPTCHA for sensitive endpoints (login, TOTP verify, WebAuthn finish-login). When enabled, the server enforces reCAPTCHA adaptively: it is only required after several consecutive authentication failures from the same client IP. This helps slow down online brute-force attempts with minimal friction for legitimate users.

Environment variables:
- RECAPTCHA_SECRET: The reCAPTCHA secret (server-side). If empty, reCAPTCHA is disabled.
- RECAPTCHA_SITE_KEY: The reCAPTCHA site key (frontend). Required when enabling.
- RECAPTCHA_MIN_SCORE: Optional, float (e.g., 0.5). If provided and the response contains a score (reCAPTCHA v3), the score must meet or exceed this value.
- RECAPTCHA_THRESHOLD: Optional, integer. Number of consecutive failures per IP before reCAPTCHA is required (default: 3).

Behavior:
- Disabled by default. If RECAPTCHA_SECRET and RECAPTCHA_SITE_KEY are both set, adaptive reCAPTCHA is active.
- After the threshold of consecutive failures, the server responds with HTTP 403 and JSON payload including:
  { "error": "Captcha required", "captchaRequired": true, "recaptchaSiteKey": "<site_key>" }
- Clients should render a reCAPTCHA challenge and include the token in subsequent requests as JSON field recaptchaToken.
- The server verifies tokens against https://www.google.com/recaptcha/api/siteverify and proceeds if successful.

Note: Rate limiting and adaptive backoff are also enabled in-memory per IP. For clustered deployments, consider a shared store (e.g., Redis) and CDN/WAF protections.


## In-memory rate limiting and adaptive backoff

To protect authentication endpoints against online brute-force attempts, the backend uses an in-memory, per-IP token bucket plus adaptive backoff:

- Login: 10 requests per minute per IP; exponential backoff after each 401/403 (base 1s, capped at 30s).
- MFA (TOTP verify, WebAuthn begin/finish): 15 requests per minute per IP; exponential backoff (base 500ms, capped at 15s).
- While backoff is active, the server responds with HTTP 429 Too Many Requests and includes a Retry-After header (seconds) indicating when you may try again.
- Entries are aged out after ~20 minutes of inactivity to avoid unbounded memory growth.
- This limiter is process-local. In multi-instance deployments, use a shared store (e.g., Redis) or add limits at your proxy/WAF/CDN.

These defaults live in server/api/middleware.go.

## Frontend behavior with adaptive reCAPTCHA

- When adaptive reCAPTCHA is enabled on the server (see below) and a client IP crosses the failure threshold, the backend will return HTTP 403 with:
  { "error": "Captcha required", "captchaRequired": true, "recaptchaSiteKey": "<site_key>" }
- The login frontend automatically detects this condition and, if a site key is available, loads Google reCAPTCHA v3, obtains a token, and transparently retries the login including recaptchaToken in the JSON body.
- If auto-resolution fails (e.g., script blocked) or no site key is provided, the auth state exposes captchaRequired and recaptchaSiteKey so the UI can render a challenge.
- Optional frontend fallback key: VITE_RECAPTCHA_SITE_KEY can be set to pre-provide a site key if the backend does not include one.

## .env example for adaptive reCAPTCHA

Set these environment variables on the backend to enable adaptive reCAPTCHA:

RECAPTCHA_SECRET=your-server-secret
RECAPTCHA_SITE_KEY=your-site-key
# Optional — require a minimum score for v3 (0..1)
RECAPTCHA_MIN_SCORE=0.5
# Optional — failures before CAPTCHA is required
RECAPTCHA_THRESHOLD=3

Notes:
- If RECAPTCHA_SECRET or RECAPTCHA_SITE_KEY is unset, CAPTCHA is disabled and the endpoints behave normally (rate limiting/backoff still applies).
- Tokens are verified against Google's siteverify API server-side.

# Nauthilus Configuration UI

A standalone web-based configuration builder for the Nauthilus authentication server.

> **⚠️ IMPORTANT**: This application uses a Go-based API server to handle backend operations. The React frontend communicates with this Go server. See the [Getting Started](#getting-started) section for details.

## Overview

This UI provides a user-friendly way to create and edit Nauthilus configuration files without having to edit YAML files manually. It's built with React, TypeScript, and Material-UI, and works completely independently from the Nauthilus service.

## Features

- **Standalone Operation**: Works independently without requiring the Nauthilus service
- **User Authentication**: Secure login system with user management capabilities
- **File Upload/Download**: Upload existing nauthilus.yml files for editing and download the resulting configuration
- **Dark Mode Support**: Toggle between light and dark themes for comfortable viewing in any environment
- **Responsive Design**: Works on desktop and mobile devices
- **Form Validation**: Validates configuration values before submission
- **Real-time Feedback**: Shows loading states and error messages
- **Modular Architecture**: Easy to extend with new configuration sections
- **Branded Interface**: Includes the Nauthilus logo in the header and sidebar

## Project Structure

```
ui/
├── public/              # Static files
├── src/                 # Source code
│   ├── api/             # API integration
│   ├── components/      # React components
│   │   ├── common/      # Shared components
│   │   └── ...          # Configuration section components
│   ├── contexts/        # React contexts
│   ├── types/           # TypeScript interfaces
│   ├── App.tsx          # Main application component
│   └── index.tsx        # Entry point
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Getting Started

### Prerequisites

- Go 1.25 or higher (for the API server)
- Node.js 14.x or higher (for building the React frontend)
- npm 6.x or higher (for building the React frontend)
- MongoDB 4.x or higher

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/croessner/nauthilus.git
   cd nauthilus/ui
   ```

2. Install dependencies:
   ```
   npm install
   ```

> Note: The frontend now uses Vite for development/build instead of Create React App.

3. The UI now uses the Nauthilus logo from the `/img` directory. If you want to use custom logo files, you can:
   - Create or copy a favicon.ico file to `public/favicon.ico`
   - Add logo192.png (192x192 pixels) to `public/logo192.png`
   - Add logo512.png (512x512 pixels) to `public/logo512.png`

   These files are referenced in the manifest.json and index.html files.

4. Configure MongoDB connection in the `.env` file:
   ```
   MONGODB_URI=mongodb://nauthilus:nauthilus_password@localhost:27017/nauthilus-ui?authSource=admin
   ```

5. For development:

   a. Start the Vite development server:
   ```
   npm run dev
   ```

   b. In a separate terminal, start the Go API server:
   ```
   cd server
   go run .
   ```

   The Vite dev server runs on port 3000 and proxies requests to the Go API server on port 3001 (configurable via FRONTEND_ADDRESS/FRONTEND_PORT in your .env).

   c. Development Mode Architecture:
   - Vite's dev server proxies API requests to the Go backend (see vite.config.ts)
   - The earlier CRA-specific `src/setupProxy.js` is no longer used by the dev server
   - The Go backend only allows cross-origin requests from an explicit allowlist
   - If `CORS_ALLOWED_ORIGINS` is unset, only local dev origins on `localhost`/`127.0.0.1` for ports `3000`, `3001`, and `3002` are allowed
   - In production, the Go server serves the built static files from the `build/` directory and provides runtime configuration via `/env-config.js`

6. For production deployment, use Docker Compose:
   ```
   docker-compose up -d
   ```

   This will build and start the entire application stack including the Go API server and MongoDB.

7. For multi-architecture builds (cross-compilation), use Docker Buildx:
   ```
   # Set up Docker Buildx builder if you haven't already
   docker buildx create --name mybuilder --use

   # Build and push multi-architecture images using the bake file
   docker buildx bake --push
   ```

   This will build images for multiple architectures (amd64, arm64, armv7, armv6, 386) using the configuration in `docker-bake.hcl`.

   You can also build for specific platforms:
   ```
   # Build only for specific platforms
   docker buildx bake --set "*.platform=linux/amd64,linux/arm64" --push
   ```

   To build without pushing to a registry (for local testing):
   ```
   # Build without pushing (load to local Docker)
   docker buildx bake --set "*.platform=linux/amd64" --load
   ```

   Note: The `--load` flag only works with a single platform. For multi-platform builds, you must use `--push`.

8. Alternatively, build the React frontend for production:
   ```
   npm run build
   ```

## Development Tools

### Code Linting

The project uses [golangci-lint](https://golangci-lint.run/) for Go code linting. This is a fast, parallel runner for many Go linters that ensures code quality and consistency.

#### Setup

1. Install golangci-lint:
   ```
   make install-lint
   ```

   Or manually:
   ```
   curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin v1.55.2
   ```

2. Run the linter:
   ```
   make lint
   ```

3. Format the code:
   ```
   make fmt
   ```

The linter configuration is in `.golangci.yml` at the root of the project. It includes settings for various linters and rules for code quality.

#### Available Make Commands

The project includes a Makefile with several useful commands:

- `make all` - Run lint, fmt, and build
- `make build` - Build the application
- `make clean` - Clean build artifacts
- `make lint` - Run golangci-lint
- `make fmt` - Format Go code
- `make test` - Run tests
- `make install-lint` - Install golangci-lint
- `make help` - Show help message

## Configuration

The UI works completely independently from the Nauthilus service. Configuration data is stored in MongoDB, and you can upload and download configuration files as needed. User session state is stored server-side and bound to HttpOnly cookies.

### User Authentication

The UI includes a user authentication system that is completely independent from the Nauthilus service:

- **Login Required**: Users must log in to access the application
- **Default Admin**: A default admin user is created on first run
- **User Management**: Admins can add, edit, and delete users
- **Role-Based Access**: Users can have different roles (admin, user)
- **Session Authentication**: Secure opaque server-side sessions via HttpOnly cookies

#### Default Admin Credentials

The application uses a default admin user with the following credentials:
- Username: `admin`
- Password: `admin`

After logging in for the first time, it's recommended to change the password using the User Management section.

#### Session Configuration

You can configure session lifetimes using environment variables:

```
REACT_APP_TOKEN_EXPIRY=3600
REACT_APP_REFRESH_TOKEN_EXPIRY=86400
REACT_APP_REMEMBER_ME_EXPIRY=86400
```

#### WebAuthn Configuration

You can configure WebAuthn settings using environment variables:

```
WEBAUTHN_RP_ID=your_domain.com
WEBAUTHN_RP_DISPLAY_NAME=Your Application Name
WEBAUTHN_RP_ORIGINS=https://your_domain.com
```

- `WEBAUTHN_RP_ID`: The Relying Party ID for WebAuthn (usually your domain name). If not set, the application will try to auto-detect it from the `FRONTEND_ADDRESS` environment variable, falling back to "localhost" if it can't determine the domain.
- `WEBAUTHN_RP_DISPLAY_NAME`: The display name for your application shown during WebAuthn registration. Defaults to "Nauthilus UI" if not set.
- `WEBAUTHN_RP_ORIGINS`: The allowed origins for WebAuthn operations (comma-separated list). If not set, the application will use default origins based on the RPID: for "localhost", it will use "http://localhost:3000" and "http://localhost:3001"; for other domains, it will use "https://<domain>".

#### User Management

The User Management section in the application allows administrators to:

- View all users
- Add new users
- Change user passwords
- Delete users
- Assign roles to users

This user management system is completely separate from the Nauthilus authentication service and is only used for accessing the UI itself.

### File Upload/Download

The UI provides buttons in the top bar for:

- **Upload**: Upload an existing nauthilus.yml or JSON configuration file
- **Download**: Download the current configuration as a nauthilus.yml file
- **Reset**: Reset the configuration to default values

### Persistent Storage

- Configuration data is stored in MongoDB
- User session state is stored server-side and bound to HttpOnly cookies
- MongoDB provides reliable server-side storage
- Configuration persists even if the browser data is cleared
- The Go API server provides endpoints to interact with MongoDB

### Backend Health Check

- The Go API server includes health check endpoints
- The `/api/health` endpoint checks the overall API server health
- The `/api/health/mongodb` endpoint checks the MongoDB connection
- This allows the UI to check connectivity to the backend and database

### Go API Server

- The application uses a Go-based API server built with the Gin framework
- The Go server handles all backend operations including:
  - API endpoints for configuration management
  - MongoDB database interactions
  - User authentication and server-side session management
  - Health checks and monitoring
- In development mode, the Go server runs separately from the React development server
  - Cross-origin requests are allowed only for the configured CORS allowlist
  - If `CORS_ALLOWED_ORIGINS` is unset, only local dev origins on `localhost`/`127.0.0.1` for ports `3000`, `3001`, and `3002` are allowed
  - In non-local deployments, set `CORS_ALLOWED_ORIGINS` explicitly to the UI origin(s)
  - Cookie-authenticated mutating requests require Origin/Referer validation plus a double-submit CSRF token (`X-CSRF-Token` + `nauthilus_ui_csrf_token`)
- In production, the Docker setup includes:
  - A Go API server container that serves both the static React files and handles API requests
  - A MongoDB container for data storage

### Supported File Formats

The UI supports uploading configuration files in the following formats:
- YAML (.yml, .yaml)
- JSON (.json)

When downloading, the configuration is always saved as a YAML file (nauthilus.yml).

### Dark Mode

The UI supports both light and dark themes:

- A theme toggle button is available in the top bar (moon/sun icon)
- Your theme preference is automatically saved in the browser's localStorage (this is the only setting that still uses localStorage)
- The theme setting persists between browser sessions
- Dark mode reduces eye strain in low-light environments

### Address Format Requirements

When configuring server addresses in the UI:

- All address fields must be specified as a valid IPv4 or IPv6 address with a port number
- IPv4 format: `127.0.0.1:8080` (IP address followed by colon and port number)
- IPv6 format: `[::1]:8080` (IPv6 address in square brackets followed by colon and port number)
- Hostname format like `localhost:8080` is not supported - use the IP address instead
- This applies to the server address in the Server Configuration section and other address fields

## Extending the UI

### Adding a New Configuration Section

1. Create a new component in the `src/components` directory:
   ```tsx
   // src/components/NewConfig.tsx
   import React from 'react';
   import { Formik, Form, Field } from 'formik';
   import * as Yup from 'yup';
   import { TextField, Grid, Button, Box } from '@mui/material';
   import { useConfig } from '../contexts/ConfigContext';
   import FormSection from './common/FormSection';

   const NewConfigSchema = Yup.object().shape({
     // Define validation schema
   });

   const NewConfig: React.FC = () => {
     const { config, updateConfigSection } = useConfig();

     if (!config) {
       return null;
     }

     const initialValues = {
       // Initialize from config
     };

     const handleSubmit = async (values: any) => {
       try {
         await updateConfigSection('new_section', values);
       } catch (error) {
         console.error('Error updating configuration:', error);
       }
     };

     return (
       <Formik
         initialValues={initialValues}
         validationSchema={NewConfigSchema}
         onSubmit={handleSubmit}
         enableReinitialize
       >
         {({ errors, touched }) => (
           <Form>
             <FormSection
               title="New Configuration"
               description="Configure new settings."
             >
               <Grid container spacing={3}>
                 {/* Add form fields */}
               </Grid>
             </FormSection>

             <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
               <Button type="submit" variant="contained" color="primary">
                 Save Changes
               </Button>
             </Box>
           </Form>
         )}
       </Formik>
     );
   };

   export default NewConfig;
   ```

2. Add the component to the routes in `App.tsx`:
   ```tsx
   import NewConfig from './components/NewConfig';

   // ...

   <Routes>
     {/* ... */}
     <Route path="/new" element={<NewConfig />} />
   </Routes>
   ```

3. Add a menu item for the new section:
   ```tsx
   const menuItems: MenuItem[] = [
     // ...
     { text: 'New Section', icon: <NewIcon />, path: '/new' },
   ];
   ```

## Troubleshooting

### Connection Errors

If you see errors like these in the console:

```
Failed to fetch: TypeError: Failed to fetch
GET http://localhost:3001/api/health 404 (Not Found)
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

**Solution**: The Go API server is not running or is not accessible. Make sure to start the Go server with `cd server && go run .` in development mode, or ensure the API container is running in Docker (`docker-compose ps`).

### CORS Errors

If you see errors like these in the console:

```
Access to fetch at 'http://localhost:3001/api/health' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Solution**:
1. Check that the browser origin is included in `CORS_ALLOWED_ORIGINS`, or use the local dev defaults (`localhost`/`127.0.0.1` on ports `3000`, `3001`, `3002`)
2. Check that the CORS middleware is properly registered in the Go server
3. Verify that the React development server is correctly proxying requests to the Go server
4. If you deploy behind a reverse proxy or TLS terminator, configure the final browser-facing origin explicitly in `CORS_ALLOWED_ORIGINS`

### MongoDB Connection Issues

If you see errors related to MongoDB connection:

```
MongoDB connection error: MongoNetworkError: failed to connect to server
```

**Solution**: 
1. Make sure MongoDB is installed and running on your system
2. Check that the MongoDB connection string in your `.env` file is correct
3. Verify that the MongoDB user has the correct permissions

### No MongoDB Collections Created

If the application starts but no collections are created in MongoDB:

**Solution**:
1. Make sure the Go API server is running
2. Check the MongoDB connection string in your `.env` file
3. Verify that the MongoDB user has write permissions to create collections
4. Try accessing the MongoDB health check endpoint at `/api/health/mongodb` to trigger a reconnection
5. Check the Go server logs for any MongoDB connection errors

## License

This project is proprietary software.

# Nauthilus UI

[... existing content omitted for brevity ...]

## Optional Google reCAPTCHA (adaptive)

The backend can optionally require Google reCAPTCHA for sensitive endpoints (login, TOTP verify, WebAuthn finish-login). When enabled, the server enforces reCAPTCHA adaptively: it is only required after several consecutive authentication failures from the same client IP. This helps slow down online brute-force attempts with minimal friction for legitimate users.

Environment variables:
- RECAPTCHA_SECRET: The reCAPTCHA secret (server-side). If empty, reCAPTCHA is disabled.
- RECAPTCHA_SITE_KEY: The reCAPTCHA site key (frontend). Required when enabling.
- RECAPTCHA_MIN_SCORE: Optional, float (e.g., 0.5). If provided and the response contains a score (reCAPTCHA v3), the score must meet or exceed this value.
- RECAPTCHA_THRESHOLD: Optional, integer. Number of consecutive failures per IP before reCAPTCHA is required (default: 3).

Behavior:
- Disabled by default. If RECAPTCHA_SECRET and RECAPTCHA_SITE_KEY are both set, adaptive reCAPTCHA is active.
- After the threshold of consecutive failures, the server responds with HTTP 403 and JSON payload including:
  { "error": "Captcha required", "captchaRequired": true, "recaptchaSiteKey": "<site_key>" }
- Clients should render a reCAPTCHA challenge and include the token in subsequent requests as JSON field recaptchaToken.
- The server verifies tokens against https://www.google.com/recaptcha/api/siteverify and proceeds if successful.

Note: Rate limiting and adaptive backoff are also enabled in-memory per IP. For clustered deployments, consider a shared store (e.g., Redis) and CDN/WAF protections.


## In-memory rate limiting and adaptive backoff

To protect authentication endpoints against online brute-force attempts, the backend uses an in-memory, per-IP token bucket plus adaptive backoff:

- Login: 10 requests per minute per IP; exponential backoff after each 401/403 (base 1s, capped at 30s).
- MFA (TOTP verify, WebAuthn begin/finish): 15 requests per minute per IP; exponential backoff (base 500ms, capped at 15s).
- While backoff is active, the server responds with HTTP 429 Too Many Requests and includes a Retry-After header (seconds) indicating when you may try again.
- Entries are aged out after ~20 minutes of inactivity to avoid unbounded memory growth.
- This limiter is process-local. In multi-instance deployments, use a shared store (e.g., Redis) or add limits at your proxy/WAF/CDN.

These defaults live in server/api/middleware.go.

## Frontend behavior with adaptive reCAPTCHA

- When adaptive reCAPTCHA is enabled on the server (see below) and a client IP crosses the failure threshold, the backend will return HTTP 403 with:
  { "error": "Captcha required", "captchaRequired": true, "recaptchaSiteKey": "<site_key>" }
- The login frontend automatically detects this condition and, if a site key is available, loads Google reCAPTCHA v3, obtains a token, and transparently retries the login including recaptchaToken in the JSON body.
- If auto-resolution fails (e.g., script blocked) or no site key is provided, the auth state exposes captchaRequired and recaptchaSiteKey so the UI can render a challenge.
- Optional frontend fallback key: VITE_RECAPTCHA_SITE_KEY can be set to pre-provide a site key if the backend does not include one.

## .env example for adaptive reCAPTCHA

Set these environment variables on the backend to enable adaptive reCAPTCHA:

RECAPTCHA_SECRET=your-server-secret
RECAPTCHA_SITE_KEY=your-site-key
# Optional — require a minimum score for v3 (0..1)
RECAPTCHA_MIN_SCORE=0.5
# Optional — failures before CAPTCHA is required
RECAPTCHA_THRESHOLD=3

Notes:
- If RECAPTCHA_SECRET or RECAPTCHA_SITE_KEY is unset, CAPTCHA is disabled and the endpoints behave normally (rate limiting/backoff still applies).
- Tokens are verified against Google's siteverify API server-side.

## Audit log retention and cleanup

The backend can periodically delete old audit log entries based on environment variables. This is useful for data minimization and storage control.

Environment variables:
- AUDIT_RETENTION_DAYS: Number of days to keep audit logs. When set to a value > 0, entries older than this threshold are deleted. When <= 0 (default 0), cleanup is disabled.
- AUDIT_CLEAN_INTERVAL_HOURS: How often (in hours) the cleanup job runs. Default is 6.

Behavior:
- On startup, if AUDIT_RETENTION_DAYS > 0, a background scheduler starts and runs every AUDIT_CLEAN_INTERVAL_HOURS, plus once shortly after startup.
- The cleanup deletes entries from the auditlog collection where ts (RFC3339) is older than now - AUDIT_RETENTION_DAYS.
- .env files are supported; variables can be placed in a .env file at the repo root or server/..

Example .env:
```
AUDIT_RETENTION_DAYS=90
AUDIT_CLEAN_INTERVAL_HOURS=6
```


## Audit policy and suppression (server-side)

To avoid noisy audit entries from routine, idempotent requests (e.g., auto-refresh GETs), the backend applies a conservative, server-side audit policy:

- By default, GET and HEAD requests are NOT audited.
- Mutating methods (POST/PUT/PATCH/DELETE) are audited.
- Optional deduplication suppresses repeated identical events within a small time window per actor.
- You can force auditing of specific paths via a regex.

Environment variables:
- AUDIT_GET_AUDIT: If set to true, GET/HEAD requests will also be audited. Default: false
- AUDIT_DEDUP_WINDOW_SEC: Deduplication window in seconds for repeated events per actor/method/path/action/target. Default: 30
- AUDIT_FORCE_REGEX: Optional regular expression to force audit for matching request paths (e.g., ^/api/session$|^/admin/)

Notes:
- Suppression is server-side; clients cannot disable auditing.
- The policy is in-memory and process-local. For clustered deployments, prefer sticky sessions or an external audit pipeline if strict dedup across instances is required.



## Docs

- Daily-Check (DE): docs/Daily-Check.de.md
- Dependency Updates (EN): docs/Dependency-Updates.md
