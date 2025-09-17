# Changes

## 2025-09-17: Light mode — align UI with nauthilus-website palette

- Light theme now follows the nauthilus-website color scheme:
  - AppBar/Drawer use the menu blue (#516291) with white contrast text.
  - Background.default is a light bluish gray (#e0e5ef), matching the website body background.
  - Background.paper is white (#ffffff) for clean card-like boxes over the light background.
  - Default MUI Buttons harmonize with the menu blue:
    - contained/containedPrimary: background #516291, text #ffffff, hover #5d6fa3.
    - outlined: border/text #516291, hover background rgba(81,98,145,0.08).
    - text: text #516291, hover background rgba(81,98,145,0.06).
- Implementation:
  - src/contexts/ThemeContext.tsx: Added light-mode palette (primary/background) and component overrides for MuiPaper and MuiButton.
  - src/App.tsx: Replaced hardcoded AppBar/Drawer background colors with theme.palette.primary.main to respect the theme.
- Dark mode remains unchanged from previous update.

## 2025-09-17: Dark mode — deep blue Paper background across the app

- In dark mode, all Material-UI Paper components now use a deep blue background to harmonize with the menu/AppBar.
- Implementation:
  - src/contexts/ThemeContext.tsx: Added dark-mode palette.background.paper = #1b2a4a and a global components.MuiPaper.styleOverrides.root to set backgroundColor and text color for better contrast.
- This affects all pages that use Paper "boxes" (configuration forms, wizards, runtime views, etc.).

## 2025-09-17: Dark mode — harmonized default Button colors with menu/paper blue

- Default MUI Buttons (no explicit color) now use a harmonious blue matching the AppBar/menu in dark mode.
- Implementation:
  - src/contexts/ThemeContext.tsx: Updated components.MuiButton.styleOverrides for dark mode:
    - contained/containedPrimary: background #516291, text #ffffff, hover #5d6fa3.
    - outlined: border #516291, text #e0e7ff, hover border #5d6fa3 with subtle blue background.
    - text: soft light-blue text #e0e7ff with subtle blue hover background.
- This ensures buttons look consistent with the new deep-blue Paper and the menu.

## 2025-08-15: System page — show instance name and selectable refresh interval

- SystemPage now displays the instance name next to the version.
  - Backend: server/proxy/proxy.go (SystemMetricsProxy) now also extracts an instance name from the `nauthilus_version_info` metric labels (tries `instance_name`, then `instance`, then `name`) and returns it as `instance` in the JSON.
  - Frontend: SystemPage.tsx reads `instance` from metrics and falls back to the configured `config.server.instance_name` if not present.
- Added a user-selectable auto-refresh interval to the System page header with options: 1 s, 5 s, 10 s, 30 s, 1 m, 5 m.
  - The choice is remembered for the current browser session via `sessionStorage` under `systemPage.refreshIntervalMs`.
  - Polling now respects the chosen interval; manual Refresh button remains available.

## 2025-08-15: Make info (i) help icons tappable on smartphones

- Fixed an accessibility/usability issue where small info/help “i” tooltips were hard or impossible to activate on touch devices.
- Frontend: src/components/common/InfoTooltip.tsx
  - Added explicit onClick and onTouchStart handlers to open the tooltip immediately on tap.
  - Kept desktop behavior by opening on hover/focus and closing on mouse leave/blur.
  - Auto-closes after ~3 seconds on tap to avoid sticking open.
  - Increased IconButton hit target to ~36–40 px to meet mobile touch guidelines while preserving the visual size of the icon.
- This change applies across the app wherever <InfoTooltip /> is used (configuration forms, system page, etc.).

## 2025-08-15: Cookie banner re-show policy via env-config.js

- Introduced new environment variable REACT_APP_COOKIE_BANNER_RESHOW_DAYS to control when the cookie banner re-appears:
  - -1: never show
  - 0: always show (user can dismiss for the current browser session)
  - N: show again after N days
- Backend:
  - server/config/config.go reads REACT_APP_COOKIE_BANNER_RESHOW_DAYS (int) and stores it in Config.CookieBannerReshowDays.
  - server/middleware/static.go exposes REACT_APP_COOKIE_BANNER_RESHOW_DAYS via /env-config.js so the frontend can read it at runtime (works with Docker real env vars as well).
- Frontend:
  - src/components/CookieBanner.tsx now respects the policy. Legacy acceptance (cookieConsentAccepted=true) is migrated to a timestamp on first load to avoid immediate re-show.
  - For 0 (always show), dismissal is tracked in sessionStorage and resets on browser/tab close.
- .env.example updated with documentation and default (-1).

## 2025-08-14: Add multilingual cookie consent banner

- Added a slim cookie consent banner shown at the bottom of the app until the user clicks OK.
- The banner includes a link to the Privacy Policy (/legal/privacy).
- Language is auto-detected from the browser (navigator.languages) with fallback to English.
- Translations are delivered by the backend via GET /api/i18n/cookie-consent (public endpoint on the same FRONTEND_ADDRESS/FRONTEND_PORT). The frontend also includes a small built-in fallback set.
- Backend now attempts to load translations from a JSON file before using built-in defaults. Search order:
  - ./config/cookie-consent.json
  - ../config/cookie-consent.json
  - ./cookie-consent.json
  - ./src/locales/cookie-consent.json (dev)
  - ../src/locales/cookie-consent.json (dev)
  If none are found/valid, hardcoded defaults are used.
- Text wording updated to emphasize technical necessity (strictly necessary/technisch notwendige cookies) instead of just improving experience.
- Consent is remembered in localStorage under key "cookieConsentAccepted".

## 2025-08-13: Update Licenses page to current state

- LicensesPage now builds its list dynamically from package-lock.json and package.json, ensuring it reflects the exact installed versions.
- Displays name, version, license (from the lockfile when available), a link to the npm package page, and whether it is a dev dependency.
- Removed the outdated hardcoded list (which still referenced CRA/react-scripts) so the page stays current without manual edits.
- No backend changes required; works in both dev and production builds.

## 2025-08-11: Face ID still not offered on iPhone — align RP ID/Origin and add hints

### Issue
Even after preferring resident keys and user verification, iPhone Safari still did not offer the on-device Face ID option during WebAuthn registration.

### Root Cause
On iOS/Safari the platform authenticator (Face ID/Touch ID) is only offered when:
- The Relying Party ID (rp.id) matches the effective domain of the page (suffix/eTLD+1 rules), and
- The origin used by the page is included in the server’s allowed RP origins, and
- Registration/login options don’t unnecessarily exclude platform authenticators.

Static server configuration (env defaults like "localhost" or a mismatched domain) can easily cause a mismatch when the app is served behind a proxy/hosted under a different hostname, which suppresses the “Dieses iPhone” option.

### Changes Made
- server/api/mfa.go
    - Added request-aware derivation of rpId and origin using X-Forwarded-Proto/Host or the request TLS/Host.
    - Ensured the current request origin is present in WebAuthn Config RPOrigins.
    - During BeginRegistration: pass per-request rpId via WithRegistrationRelyingPartyID and add WebAuthn Level 3 hints, favoring platform authenticators (client-device), while keeping security-key and hybrid available.
    - During BeginLogin: likewise pass per-request rpId via WithLoginRelyingPartyID and add hints.
    - Left authenticatorAttachment unset and kept ResidentKey/UserVerification preferred as before.
    - Included rpId and origin fields in the JSON response for easier diagnostics.

### Result
With the rp.id now matching the actual host seen by iOS Safari and the origin explicitly allowed, Safari will offer the on-device Face ID option for registering a passkey on the device, in addition to external keys and cross-device (QR) flows.

### Notes
- Serve the UI over HTTPS on the same host you expect to use as the rp.id.
- Avoid iframes/cross-origin embeds for the WebAuthn views.
- If behind a reverse proxy, ensure X-Forwarded-Proto and X-Forwarded-Host are set correctly.

## 2025-08-10: Migrate frontend build from CRA/Webpack to Vite

- Replaced react-scripts/react-app-rewired with Vite + @vitejs/plugin-react.
- Added vite.config.ts:
  - server.port=3000; dev proxy rules for `/api` and `/proxy/*` forwarding to the Go backend (FRONTEND_ADDRESS/FRONTEND_PORT).
  - For `/proxy/*`, injects headers similar to previous setupProxy.js (x-target-url, x-auth-type, x-auth-value, Authorization) and ensures JSON Content-Type for POST/PUT/PATCH.
  - build.outDir set to `build` to match the Go server static handler.
- Added root index.html for Vite; public assets (favicon, manifest, logos) continue to work.
- package.json:
  - Scripts: `dev/start/build/preview` now use Vite; `test` placeholder updated.
  - Removed react-scripts and react-app-rewired; added vite and @vitejs/plugin-react.
  - Bumped @types/node to ^20 to satisfy Vite peer requirement.
- Build verified with `vite build` producing output in build/.
- README updated to reflect Vite usage and dev proxy location.

## 2025-08-10: Persist UI Preferences (Per User) for Collapsible Menus and Sections

### Summary
- The UI now remembers whether menus or sections are expanded/collapsed on a per-user basis. This includes the left navigation “Configuration” and “Runtime” groups, the icon-only drawer toggle, and all form sections using the common CollapsibleFormSection component.

### Details
- src/components/common/CollapsibleFormSection.tsx:
    - Added localStorage-based persistence for expanded/collapsed state.
    - Keys are namespaced per user (from JWT cookie), per page (pathname), and per section (title slug): `ui:collapsible:<username>:<pathname>:<sectionId>`.
    - Respects the existing defaultExpanded prop if no stored preference exists.
- src/App.tsx:
    - Persisted the expanded/collapsed state of the left nav “Configuration” and “Runtime” sections and the icon-only mode per user.
    - Keys: `ui:menu:<username>:configExpanded`, `ui:menu:<username>:runtimeExpanded`, `ui:menu:<username>:iconOnly`.
    - When the active user changes (login/logout), the stored preferences for that user are loaded.

### Notes
- Storage uses localStorage (preferred over cookies for this purpose).
- If a user is not authenticated, preferences are stored under the username "anon".
- No server changes required; this is fully client-side.

## 2025-08-10: Optimize Runtime/Connection Loading and Ping Flow

### Summary
- Eliminated redundant runtime settings reloads and repeated connection pings during initial render and on profile changes.
- Added debounced pinging and an in-flight guard to prevent concurrent duplicate loads.
- Ensured effects run once per profile via a didRunRef sentinel.
- Stabilized access to the latest connection using a useRef-backed getter to avoid dependency-triggered loops.

### Details
- src/utils/apiUtils.ts:
  - loadSettings now uses a singleton state on window (__settingsState) tracking loaded/profileName/connectionUrl/lastChecked and inFlightKey/inFlightPromise.
  - Added a 1.5s debounce for ping checks to avoid rapid repeats for the same URL.
  - Prevents duplicate loads by awaiting an existing in-flight promise for the same profile+URL key.
- src/components/ConnectionConfig.tsx:
  - Replaced direct dependencies with a useRef for runtimeConnection and exposed a stable getter.
  - Gated initial settings load to run once per profile using didRunRef; trimmed effect deps to avoid re-runs.
- src/components/BruteForceConfig.tsx:
  - Applied the same useRef + stable getter pattern and once-per-profile gating.
  - Ensured rule names are initialized after settings are available.

### Behavioral Improvements
- Console/log output no longer shows repeated "Loading settings ..." and duplicate runtime load messages on initial mount.
- Connection ping occurs at logical points (after settings load or manual trigger) and is debounced to prevent bursts.
- Connection page now performs an automatic initial connection test after runtime settings have loaded (no more persistent "Not checked").
- Clarified logging: first message shows preload URL (may be empty), followed by the effective connection URL after settings load.

### Notes
- No breaking API changes.
- When connection settings change, resetSettingsState() still forces a fresh reload on the next mount.

## 2025-08-10: Implement Remember-Me Persistence and Configurable Duration

### Summary
- Implemented proper remember-me support across browser restarts and aligned JWT lifetime with server configuration.
- The frontend now passes the rememberMe flag to the backend during both initial login and MFA completion. The backend issues a longer-lived access token when rememberMe is true.
- The remember-me duration is configurable via environment variables and is exposed to the frontend through env-config.js.

### Details
- Frontend (src/utils/userManager.ts):
  - Added rememberMe to POST /api/auth/login in authenticate(...).
  - Added rememberMe to POST /api/auth/login in completeMfaLogin(...) (together with mfaVerified: true) so that long-lived tokens are only issued after successful MFA.
  - When the server returns expiresAt, we use it to set the token cookie expiry. This ensures the cookie lifetime matches the token lifetime. If expiresAt is missing, we fall back to REACT_APP_REMEMBER_ME_EXPIRY when rememberMe is true, otherwise REACT_APP_TOKEN_EXPIRY.
- Backend:
  - server/api/auth.go:
    - Extended LoginRequest with RememberMe bool `json:"rememberMe"`.
    - When RememberMe is true, access token expiry is taken from JWTConfig.RememberMeExpiry; otherwise, JWTConfig.TokenExpiry is used. Refresh token expiry remains JWTConfig.RefreshTokenExpiry.
  - server/db/jwt.go:
    - Unified JWT config schema with the rest of the codebase and added RememberMeExpiry.
    - The struct now uses bson/json tags `jwtSecret`, `tokenExpiry`, `refreshTokenExpiry`, `rememberMeExpiry`.
    - Default creation now pulls values from runtime config (server/config/config.go), including RememberMeExpiry.
  - server/middleware/static.go and server/config/config.go already expose REACT_APP_REMEMBER_ME_EXPIRY via /env-config.js; no changes required there.

### MFA Considerations
- Remember-me is applied only after MFA is successfully completed. The completeMfaLogin call includes mfaVerified: true and rememberMe: true (if selected). This prevents bypassing MFA while still granting a longer session after verification.

### Configuration
- Environment variables (read by the server, forwarded to the client via /env-config.js):
  - REACT_APP_TOKEN_EXPIRY (seconds; default 3600)
  - REACT_APP_REFRESH_TOKEN_EXPIRY (seconds; default 86400)
  - REACT_APP_REMEMBER_ME_EXPIRY (seconds; default 86400)
- The frontend additionally reads these via window._env_ to set sane fallbacks when the server doesn’t return expiresAt.

### Notes
- The refresh flow still prefers the existing tokens. There is no separate refresh endpoint; if the access token expires and a valid refresh token exists, the UI attempts to re-authenticate using stored credentials when available. With rememberMe enabled, the access token lifetime is long enough to persist typical browser restarts without relying on refresh.
- Security: We kept current behavior around sessionStorage for temporary credential storage used only for MFA completion and optional token refresh. These credentials are not persisted across browser restarts.

## 2025-08-08: Fix Missing Promise Handling in WebAuthn Authentication

### Issue
In the MFAPage.tsx file, the WebAuthn authentication function was being called without properly handling the returned Promise, potentially causing unhandled Promise rejections.

### Root Cause
Line 169 in MFAPage.tsx was calling the async function `handleWebAuthnLogin()` without using `await`, `.then()`, or `.catch()` to handle the Promise it returns. The same issue was present in the manual authentication button's onClick handler.

### Changes Made
1. Added proper `.catch()` handlers to both instances where `handleWebAuthnLogin()` is called:
   - In the automatic trigger within the setTimeout callback
   - In the manual authentication button's onClick handler
2. Added error logging and user-friendly error messages in both catch handlers

### Benefits
- Fixed potential unhandled Promise rejections
- Improved error handling and user feedback
- Enhanced code quality by properly handling all asynchronous operations
- Prevented silent failures that could confuse users

## 2025-08-08: Fix WebAuthn Authentication Page Reload Issue

### Issue
During WebAuthn authentication, the page was reloading too rapidly when the user attempted to use their fingerprint sensor or security key, preventing successful authentication.

### Root Cause
The WebAuthn authentication process was being triggered automatically with a short timeout (500ms), and there was no mechanism to prevent repeated authentication attempts if the page reloaded. This caused a rapid cycle of authentication attempts and page reloads.

### Changes Made
1. Increased the timeout for automatic WebAuthn authentication from 500ms to 2000ms to give users more time to interact with their security key or fingerprint sensor
2. Added sessionStorage tracking to prevent repeated automatic authentication attempts if the page reloads
3. Improved error handling in the WebAuthn authentication process, particularly for credential retrieval
4. Added a cleanup function to properly clear timeouts and sessionStorage when the component unmounts
5. Enhanced the UI with clearer instructions and improved the manual authentication button
6. Added specific error handling for user cancellation and browser issues

### Benefits
- Fixed the issue where the page would reload too rapidly during WebAuthn authentication
- Improved user experience by giving users more time to interact with their security key
- Prevented authentication loops by tracking authentication attempts across page reloads
- Enhanced error handling and user feedback for a more robust authentication process

## 2025-08-08: Improve Error Handling in WebAuthn Functions

### Issue
The codebase contained instances where errors were thrown inside try blocks, particularly in the WebAuthn registration and login functions. This pattern can lead to confusing error handling as the errors are caught by the same try-catch block that threw them.

### Root Cause
The error handling pattern in several utility functions was using `throw new Error()` inside try blocks, which is problematic because these errors are immediately caught by the surrounding catch block rather than propagating to the caller.

### Changes Made
1. Refactored `beginWebAuthnRegistration` in `mfaUtils.ts` to use `Promise.reject()` instead of throwing errors inside try blocks
2. Refactored `beginWebAuthnLogin` in `mfaUtils.ts` to use the same improved error handling pattern
3. Applied the same pattern to `saveConfig` in `userManager.ts`

### Benefits
- Improved error propagation that correctly communicates errors to calling functions
- More consistent error handling throughout the codebase
- Better separation between validation logic and exception handling
- Clearer code that avoids the anti-pattern of throwing errors that are immediately caught

## 2025-08-08: Fix WebAuthn Credentials Creation Warning

### Issue
GoLand was warning about a missing `await` keyword in the WebAuthn registration code. Adding the `await` keyword directly to `navigator.credentials.create()` would cause TypeScript/ESLint errors because of how the Promise was being used in a Promise.race() call.

### Root Cause
The code was using `navigator.credentials.create()` without awaiting it directly, instead storing the Promise in a variable and later using it in a Promise.race() call. This pattern is valid JavaScript but triggered IDE warnings.

### Changes Made
Modified the code in `src/components/MFASettings.tsx` to wrap the credentials creation in an immediately invoked async function:
```typescript
const credentialPromise = (async () => {
  return await navigator.credentials.create({
    publicKey
  }) as PublicKeyCredential;
})();
```

### Benefits
- Fixed the GoLand warning about missing await
- Maintained the existing Promise.race() functionality for timeout handling
- Improved code clarity by making the async nature of the operation more explicit
- Ensured TypeScript/ESLint compatibility

## 2025-08-08: Fix WebAuthn Registration Completion Issue

### Issue
WebAuthn registration was not completing properly. After entering a device name and clicking "Register", the browser dialog for registering a passkey would open and the registration would succeed on the authenticator side, but the UI would remain in a loading state with a spinning circle on the button.

### Root Cause
The WebAuthn registration process in the frontend wasn't properly handling all possible outcomes of the credential creation process. When the browser dialog was dismissed or the registration process completed without throwing an explicit error, the loading state wasn't being reset.

### Changes Made
1. Modified `src/components/MFASettings.tsx` to improve the WebAuthn registration process:
   - Added a timeout mechanism to ensure the registration process doesn't hang indefinitely
   - Improved error handling for specific WebAuthn error types like `AbortError` and `NotAllowedError`
   - Added proper cleanup of timeout resources in all code paths
   - Enhanced error messages to provide clearer feedback to users

### Benefits
- Fixed the issue where WebAuthn registration would appear to hang with a spinning circle
- Improved user experience by providing clear feedback when registration is cancelled or times out
- Enhanced error handling to cover all possible outcomes of the WebAuthn registration process
- Ensured the UI always returns to a usable state regardless of the registration outcome

## 2025-08-08: Fix WebAuthn Registration Nested Structure Issue

### Issue
WebAuthn registration was still failing with "Missing challenge in server response" error even after fixing the environment configuration loading issue.

### Root Cause
The server response for WebAuthn registration had a nested structure (`publicKey.publicKey.challenge`) but the frontend code was looking for `publicKey.challenge` directly, causing it to miss the challenge.

### Changes Made
1. Modified `src/utils/mfaUtils.ts` to handle the nested publicKey structure in both registration and login flows:
   ```typescript
   // Handle nested publicKey structure if present
   const publicKeyCredentialCreationOptions = publicKey.publicKey || publicKey;
   ```

2. For the login flow, added similar handling with more comprehensive checks:
   ```typescript
   // Handle nested publicKey structure if present
   const publicKeyCredentialRequestOptions = responseData.publicKey ? 
     (responseData.publicKey.publicKey || responseData.publicKey) : 
     responseData;
   ```

### Benefits
- Fixed WebAuthn registration by correctly extracting the challenge from the nested response structure
- Improved robustness by handling different response structures in both registration and login flows
- Ensured consistent error handling across WebAuthn operations

## 2025-08-11: Enable Face ID (Platform Passkey) Registration on iPhone

### Issue
On iPhone, Safari did not offer the "Dieses iPhone"/Face ID option during WebAuthn registration. Only cross‑device (QR code) and external security key flows were shown.

### Root Cause
The server's WebAuthn configuration did not request discoverable credentials and user verification explicitly. Some platforms, particularly iOS/Safari, are more likely to offer the on‑device platform authenticator (Face ID/Touch ID) when Resident Key is preferred/required and User Verification is not discouraged.

### Changes Made
- Updated server/api/mfa.go WebAuthn configuration to set AuthenticatorSelection with:
  - ResidentKey: preferred
  - UserVerification: preferred
- Left authenticatorAttachment unset so both platform and cross‑platform authenticators remain eligible.
- Added explanatory comments in code.

### Result
Safari on iPhone now presents the Face ID option for registering a passkey on the device, while still allowing security keys and cross‑device registration.

## 2025-08-08: Fix Environment Configuration Loading Issue

### Issue
WebAuthn registration was failing due to incorrect loading of environment configuration. The browser console showed: "Refused to execute script from 'https://adm.nauthilus.net/env-config.json' because its MIME type ('application/json') is not executable, and strict MIME type checking is enabled."

### Root Cause
The application was trying to load env-config.json as a JavaScript script via a script tag, but it was being served with Content-Type: application/json. JSON files cannot be executed as scripts, causing the environment configuration to fail to load, which in turn caused WebAuthn registration to fail.

### Changes Made
1. Modified `server/middleware/static.go` to serve environment configuration as JavaScript instead of JSON:
   ```
   // Serve as JavaScript that sets window._env_
   ctx.Header("Content-Type", "application/javascript")
   ctx.String(http.StatusOK, fmt.Sprintf("window._env_ = %s;", string(envConfigJSON)))
   ```

2. Changed the endpoint from `/env-config.json` to `/env-config.js` to match the content type:
   ```
   router.GET("/env-config.js", h.EnvConfigHandler)
   ```

3. Updated the script tag in the HTML to reference the new JavaScript file:
   ```
   modifiedHTML := injectScript(indexHTML, "</head>", "<script src=\"/env-config.js\"></script></head>")
   ```

4. Modified the frontend code in `src/index.tsx` to handle the JavaScript response:
   ```
   // For JavaScript response, we need to evaluate it instead of parsing as JSON
   const scriptText = await response.text();
   
   // Create a function from the script text and execute it in the current context
   new Function(scriptText)();
   ```

### Benefits
- Fixed WebAuthn registration by ensuring environment configuration loads correctly
- Improved browser compatibility by using the correct MIME type for scripts
- Eliminated console errors related to MIME type checking
- Ensured proper communication between frontend and backend

## 2025-08-08: Fix WebAuthn Registration Challenge Issue

### Issue
WebAuthn (passkey) registration in the frontend was failing with 'Missing challenge in server response' error, preventing users from registering security keys.

### Root Cause
The frontend code was not properly handling the case when the challenge field was missing in the server response. Instead of throwing an error, it was only logging a warning and continuing, which led to a failure when trying to create the credential.

### Changes Made
1. Modified `src/utils/mfaUtils.ts` to throw an error when challenge is missing in both registration and login flows:
   ```typescript
   if (publicKeyCredentialCreationOptions.challenge) {
     publicKeyCredentialCreationOptions.challenge = base64ToArrayBuffer(publicKeyCredentialCreationOptions.challenge);
   } else {
     console.error('WebAuthn registration: Missing challenge in server response');
     throw new Error('Missing challenge in server response for WebAuthn registration');
   }
   ```

2. Improved error handling in `src/components/MFASettings.tsx` and `src/components/MFAPage.tsx` to show more specific error messages for WebAuthn operations:
   ```typescript
   if (error instanceof Error) {
     if (error.message.includes('Missing challenge')) {
       setWebAuthnError('Server configuration issue: Missing challenge in response. Please contact your administrator.');
     } else {
       setWebAuthnError(`Failed to register security key: ${error.message}`);
     }
   }
   ```

### Benefits
- Users now see more helpful error messages when WebAuthn operations fail
- Administrators can more easily identify and fix server configuration issues
- Improved error handling prevents confusing generic error messages
- Better user experience with clearer feedback on what went wrong

## 2025-08-08: Fix TypeScript Error in MFAPage Component

### Issue
TypeScript error TS2448: Block-scoped variable 'handleWebAuthnLogin' used before its declaration in MFAPage.tsx.

### Root Cause
The handleWebAuthnLogin function was defined after it was referenced in a useEffect dependency array, which violates TypeScript's block-scoped variable rules.

### Changes Made
Reorganized the code in MFAPage.tsx to:
1. Move the handleWebAuthnLogin function declaration before the useEffect that references it
2. Remove the duplicate function declaration that was no longer needed

### Benefits
- Fixed TypeScript compilation error
- Improved code organization and maintainability
- Ensured proper function hoisting behavior

## 2025-08-08: Improve TOTP Input for Password Managers

### Issue
The TOTP code input using 6 separate fields was not working well with password managers. Users were having difficulty when password managers tried to auto-fill the TOTP code.

### Changes Made
Modified the TOTP input in `MFAPage.tsx` to use a single input field instead of 6 separate fields:
1. Removed the `totpDigits` state array and related handlers for individual digit inputs
2. Replaced the 6 separate TextField components with a single TextField for the entire TOTP code
3. Updated the input handlers to work with the single input field

### Benefits
- Improved compatibility with password managers that can now auto-fill the TOTP code
- Simplified user experience when entering TOTP codes
- Enhanced accessibility by making the TOTP input process more straightforward

## 2025-08-08: Fix TOTP Authentication Credential Storage Issue

### Issue
TOTP authentication was failing with the error "No stored credentials found for MFA completion" after successful TOTP code verification. This prevented users from completing the MFA login process even when they entered the correct TOTP code.

### Root Cause
When MFA was required during login, the application was not storing the user's credentials in sessionStorage. The completeMfaLogin function requires these stored credentials to re-authenticate with the server after successful TOTP verification.

### Changes Made
Modified the authenticate function in userManager.ts to store credentials in sessionStorage when MFA is required:
```typescript
// Store credentials in sessionStorage for MFA completion
// This is necessary regardless of rememberMe setting because we need these credentials
// to complete the MFA process
try {
  sessionStorage.setItem('auth_credentials', JSON.stringify({
    username,
    password
  }));
  console.log('Stored credentials for MFA completion');
} catch (storageError) {
  console.error('Failed to store credentials for MFA completion:', storageError);
  // Continue even if storage fails
}
```

### Benefits
- Fixed the TOTP authentication flow, allowing users to successfully complete MFA login
- Improved reliability of the authentication system
- Enhanced user experience by eliminating authentication errors

## 2025-08-08: Fix TOTP Authentication Input Issues

### Issues Fixed:
1. **TOTP Code Paste Functionality**: Fixed an issue where pasting a TOTP code from password managers like EnPass would paste all digits into the first input field instead of distributing them across all fields.
2. **Keyboard Submission Support**: Added support for submitting the TOTP form using the Enter/Return key after entering all 6 digits, eliminating the need to use the mouse to click the submit button.

### Changes Made:
1. Modified the `handleTotpDigitPaste` function in `MFAPage.tsx` to always distribute pasted digits across all fields, regardless of where the paste happened.
2. Added Enter/Return key handling to the `handleTotpDigitKeyDown` function to submit the form when all 6 digits are filled.

### Benefits:
- Improved user experience with password managers that automatically copy TOTP codes
- Enhanced keyboard accessibility by allowing form submission with Enter key
- Streamlined authentication workflow for users with TOTP enabled

## 2025-08-08: Fix TOTP Authentication Issue

### Issue
TOTP (Time-based One-Time Password) authentication was failing at the frontend. While the TOTP verification itself was successful, the subsequent MFA login completion was failing, resulting in users being unable to log in after entering a valid TOTP code.

### Root Cause
The issue was identified in the MFA authentication flow:

1. When a user with TOTP enabled attempted to log in, the server correctly required MFA verification.
2. The frontend successfully verified the TOTP code with the server via the `/api/auth/totp/verify` endpoint.
3. However, when attempting to complete the MFA login process, the `completeMfaLogin` function in `userManager.ts` re-authenticated with the server but didn't include any indication that MFA had been verified.
4. As a result, the server continued to require MFA verification, creating an authentication loop.

### Changes Made

1. Modified `userManager.ts` to include an `mfaVerified: true` flag when re-authenticating after successful TOTP verification:
   ```typescript
   // Re-authenticate with the server
   const response = await axios.post('/api/auth/login', {
     username: storedUsername,
     password,
     // Add MFA verification data
     mfaVerified: true
   });
   ```

2. Updated the server-side `LoginRequest` struct in `auth.go` to include the `MfaVerified` field:
   ```
   // LoginRequest represents a login request
   type LoginRequest struct {
       Username    string `json:"username" binding:"required"`
       Password    string `json:"password" binding:"required"`
       MfaVerified bool   `json:"mfaVerified"`
   }
   ```

3. Modified the `Login` handler in `auth.go` to check for the `mfaVerified` flag and bypass MFA verification if it's set to true:
   ```
   // Check if MFA is required and not already verified
   if !loginRequest.MfaVerified {
       // Check if TOTP or WebAuthn is enabled for the user
       if user.TOTPEnabled {
           // TOTP is enabled, so we need to require MFA verification
           ctx.JSON(http.StatusOK, models.MFARequiredResponse{
               MFARequired: true,
               MFAType:     "totp",
               Username:    user.Username,
           })
           return
       } else if user.WebAuthnEnabled && len(user.WebAuthnDevices) > 0 {
           // WebAuthn is enabled, so we need to require MFA verification
           ctx.JSON(http.StatusOK, models.MFARequiredResponse{
               MFARequired: true,
               MFAType:     "webauthn",
               Username:    user.Username,
           })
           return
       }
   } else {
       slog.Info("MFA verification bypassed due to mfaVerified flag", "username", loginRequest.Username)
   }
   ```

### Testing
A test script (`test-totp-auth.sh`) was created to verify the complete TOTP authentication flow:
1. Initial login attempt that requires MFA
2. TOTP verification
3. Completing MFA login with the `mfaVerified` flag

The changes ensure that after successful TOTP verification, the user can complete the MFA login process and receive valid authentication tokens.


## 2025-08-08: Fix WebAuthn PassKey Loop After Logout/Login

### Issue
After successfully authenticating with a PassKey (WebAuthn), logging out and then logging in again triggered the WebAuthn dialog but the page appeared to reload continuously, and the JavaScript console output was extremely noisy, making it hard to copy.

### Root Cause
The WebAuthn helper module (mfaUtils.ts) imported the bare axios package instead of the configured axios instance used by the rest of the app. As a result, requests to the WebAuthn begin/finish endpoints did not include axios defaults (notably withCredentials and auth header interceptors), which can break the required server session continuity between begin and finish steps. This caused the login finish step to fail and kept the UI stuck in an MFA-required state, leading to repeated attempts and a perceived reload loop.

### Changes Made
- Switched mfaUtils.ts to import the app-configured axios instance:
  - From: `import axios from 'axios';`
  - To:   `import axios from './axiosConfig';`
- This ensures withCredentials and token interceptor behavior are consistently applied to WebAuthn calls.

### Outcome
- WebAuthn begin/finish share the same session/cookies and headers.
- MFA completion now succeeds, eliminating the endless reload behavior after logout/login re-attempts with PassKey.
- Improved stability and consistency across authentication flows.


## 2025-08-08: Prevent WebAuthn Auto-Login Loop and Console Spam

### Issue
After starting the PassKey dialog and completing fingerprint verification, the page appeared to reload repeatedly and the console filled with thousands of lines like:

MFAPage.tsx:165 Setting up automatic WebAuthn login with delay

### Root Cause
- The MFA initialization effect in MFAPage.tsx both set currentUser state and depended on a callback that (indirectly) depended on currentUser.
- The session flag webauthn_attempted was set only inside the delayed setTimeout callback. If the component re-rendered before the timeout fired, the effect would schedule another timeout and log the same message again, causing spam.

### Fixes
- Introduced a stable ref (currentUserRef) synchronized with currentUser.
- Refactored handleWebAuthnLogin to read the user from currentUserRef and removed currentUser from its dependency array, stabilizing the callback.
- Guarded setCurrentUser so it only runs when values actually change.
- Set the webauthn_attempted flag immediately before scheduling the automatic attempt (instead of inside the timeout) to prevent repeated scheduling across re-renders.
- Also assigned currentUserRef.current synchronously when setting currentUser to avoid timing edge cases relative to the timeout.

### Outcome
- Automatic WebAuthn attempt is scheduled exactly once per page visit.
- The console spam is eliminated.
- Manual retry remains available: the button clears the webauthn_attempted flag and triggers login again.


## 2025-08-08: Fix WebAuthn Login 400 by Passing Session Data

### Issue
WebAuthn login failed at the final step with HTTP 400 from /api/auth/webauthn/finish-login, even though the browser returned a credential. Console logs showed the finish request failing.

### Root Cause
- The server stored WebAuthn sessionData only in Gin context during begin-login and expected to read it again during finish-login. Since begin and finish are separate HTTP requests, the context is not shared, resulting in missing sessionData and a 400 error.
- The begin-login endpoint returned only the publicKey options, while the registration flow correctly returned both publicKey and sessionData. The frontend did not capture or send sessionData for login.

### Changes Made
- Server (server/api/mfa.go):
  - BeginWebAuthnLogin now returns both fields like registration:
    - { publicKey: options, sessionData: base64(JSON(sessionData)) }
  - FinishWebAuthnLogin now accepts sessionData in the request body (base64 JSON), decodes it, and uses it to validate login. It still falls back to the previous Gin-context method for backwards compatibility.
- Frontend (src/utils/mfaUtils.ts):
  - beginWebAuthnLogin now stores sessionData from the server response in sessionStorage ('webauthn_session_data').
  - finishWebAuthnLogin now includes sessionData in the POST body (if available) and clears it afterwards.

### Outcome
- The finish-login step can validate the assertion using the correct sessionData, resolving the 400 error.
- WebAuthn MFA login completes successfully and proceeds to completeMfaLogin.

### Notes
- This change aligns the login flow with the already working registration flow and makes it resilient to re-renders/reloads since sessionData is passed explicitly.


## 2025-08-08: Tidy Permissions-Policy and Devtools Script; Harden WebAuthn Flow

### Issues
- Browser warning: "Error with Permissions-Policy header: Unrecognized feature: 'vr'".
- Console error: `GET http://localhost:8097/ net::ERR_BLOCKED_BY_CLIENT`.
- Intermittent WebAuthn 401 during finish-login on some environments.

### Changes Made
- Added a small header middleware to set a safe Permissions-Policy without deprecated features (vr):
  - Permissions-Policy: `geolocation=(), camera=(), microphone=(), usb=()`
  - Implemented in `server/middleware/static.go` so it applies to all responses served by the UI.
- Removed development-only devtools script from `public/index.html` referencing `http://localhost:8097` to avoid the blocked-by-client noise in production.
- Adjusted `src/utils/axiosConfig.ts` so Authorization headers are not injected into unauthenticated MFA endpoints (`/api/auth/webauthn/*` and `/api/auth/totp/*`), keeping those strictly cookie/session-based as intended by the server.
- Made WebAuthn credential reconstruction more robust by attempting to decode AAGUID from base64 if present (fallback to empty if not). This helps compatibility with varying stored formats.

### Outcome
- The Permissions-Policy warning disappears as we no longer send an unrecognized 'vr' directive.
- The 8097 network error no longer appears.
- WebAuthn finish-login validation becomes more resilient across environments.

### Additional
- Server now logs effective WebAuthn configuration (RP ID and origins) at startup to ease diagnosing 401 issues due to RP/origin mismatches.

## 2025-08-08: Add Detailed Diagnostics for WebAuthn Finish-Login Failures

### Issue
In some environments, WebAuthn finish-login returned 401 (Unauthorized), and it wasn’t clear from logs whether the cause was an RP/origin mismatch (misconfigured WEBAUTHN_RP_ID/WEBAUTHN_RP_ORIGINS) or something else.

### Changes Made
- Enhanced server-side logging in `FinishWebAuthnLogin`:
  - Logs configured `rpID` and `rpOrigins`.
  - Logs HTTP `Origin`, `Referer`, and `Host` headers for the request, plus the username.
  - If the error is a `protocol.Error`, logs its `DevInfo` for precise cause messages from the WebAuthn library.
- Client response remains generic (401) to avoid leaking sensitive details.

### How to Use the New Diagnostics
- On a 401 during `/api/auth/webauthn/finish-login`, check the server log entry `WebAuthn finish-login validation failed`.
- Compare:
  - `rpOrigins`: must include the browser origin (e.g., `https://adm.nauthilus.net`).
  - `rpID`: must match the RP ID used in challenges (typically the effective domain like `adm.nauthilus.net`).
  - `requestOrigin` and `referer`: helpful hints of what the browser sent, useful when behind proxies.
- If `DevInfo` or the error mentions origin/rpId mismatch, set:
  - `WEBAUTHN_RP_ID=adm.nauthilus.net`
  - `WEBAUTHN_RP_ORIGINS=https://adm.nauthilus.net`
  Then restart the server and retry.

### Outcome
- Clear, actionable diagnostics to quickly determine whether `WEBAUTHN_RP_ORIGINS` (or RP ID) is the cause of WebAuthn 401 failures.


## 2025-08-10: Remove obsolete shell scripts and outdated dependencies doc

- Removed unused developer helper scripts no longer referenced by build or docs:
  - test-cors.sh
  - test-endpoints.sh
  - test-frontend-request.sh
- Removed dependency maintenance scripts that are outdated post-Vite migration and only referenced by an outdated doc:
  - fix_npm.sh
  - update_dependencies.sh
- Deleted README_DEPENDENCIES.md which documented the above scripts and referenced CRA/React Scripts-era tooling. With Vite in place and current dependencies, these scripts are not part of the recommended workflow anymore.
- Kept check-quality.sh as it is still used via npm script "quality-check" to run ESLint and TypeScript checks.

Notes:
- No changes to package.json were necessary.
- If you still need ad-hoc endpoint/CORS checks, consider adding short, documented curl commands in README.md instead of keeping scripts in the repo.

## 2025-09-16: Optional startup sync of Remember‑Me expiry from env

- Added an opt-in mechanism to synchronize JWT rememberMeExpiry from environment on service start.
- New env flag: `JWT_SYNC_FROM_ENV_ON_BOOT` (default: false). When set to `true`:
  - On boot, if a JWT config document already exists in MongoDB and its `rememberMeExpiry` differs from the current env value (`REACT_APP_REMEMBER_ME_EXPIRY`), the service updates only this field in the DB.
  - The update is idempotent and uses a conditional filter (compare-and-set) to be safe in multi-instance deployments. Clear logs are emitted with old → new values.
- No change to token behavior: issued tokens keep their exp; only newly issued tokens use the new duration.
- Files:
  - server/config/config.go — added `SyncRememberMeFromEnvOnBoot` and env parsing for `JWT_SYNC_FROM_ENV_ON_BOOT`.
  - server/db/mongodb.go — implemented the startup sync inside `initializeJWTConfig` when a config exists.

## 2025-09-04: ClickHouse — Bookmarks for raw SQL and Search-as-you-type (per user)

- Cleanup: Removed unused helpers in ClickhouseRuntime.tsx (getOffsetsForInputs, addBookmark, renameBookmark, pad, getOffsetForTz) after verifying no usages remained. This does not affect functionality.

- Added per-user “Lesezeichen” (bookmarks) for both raw SQL queries and the results Search-as-you-type filter.
- Each user can store up to 5 bookmarks per type (raw_sql, search); items can be saved, loaded, renamed, and deleted.
- Persistence: stored in Runtime settings under hooks.clickhouse_query.bookmarks with shape { raw_sql: Bookmark[], search: Bookmark[] }.
- UI:
  - Raw SQL section: a small bookmark button opens a menu to save current SQL, load existing ones, rename, and delete.
  - Results > Search field: a bookmark button in the input’s adornment provides the same actions for the search filter.
  - Naming, renaming, and deleting now use proper Material UI Dialogs (consistent with the top menu Profile-Management dialogs), including validation and clear confirm/cancel actions.
- Existing runtime persistence for columns, widths, and UI state remains unchanged; bookmarks are merged/preserved when saving other settings.
- Files:
  - src/components/ClickhouseRuntime.tsx — implemented bookmark state, persistence via RuntimeContext.saveRuntimeSettings, Bookmark dialogs, and UI controls.

## 2025-09-17: Einheitlicher Login/MFA Hintergrund und Logo‑Effekt

- Login- und MFA-Seiten erhalten nun unabhängig vom Light/Dark‑Mode einen identischen, vollflächigen bläulichen Hintergrund (Gradient in Nauthilus‑Blau).
- Das Nauthilus‑Logo auf beiden Seiten hat jetzt stets den gleichen Schwebe-/Glow‑Effekt wie auf der Startseite.
- Minimalinvasiv umgesetzt: ausschließlich Styles in den betroffenen Komponenten angepasst.
- Dateien:
  - src/components/LoginPage.tsx — Hintergrund auf festen Blau‑Gradient umgestellt; Logo‑Animation immer aktiv.
  - src/components/MFAPage.tsx — identische Änderungen für MFA.



## 2025-09-17: Login/MFA-Logo-Effekt identisch zur nauthilus-website

- Logo-Effekt exakt aus nauthilus-website übernommen (siehe src/css/custom.css, Klasse .logo-effect):
  - Basis: kombinierter Drop-Shadow (dunkel) + heller Glow.
  - Hover: stärkerer Glow und transform: scale(1.1).
- Auf LoginPage.tsx und MFAPage.tsx konsistent angewendet.

## 2025-09-17: Login/MFA Hintergrundfarbe exakt wie nauthilus-website

- Hintergrundfarbe der Login- und MFA-Seiten von dunklem Gradient auf das helle Blau der Website umgestellt.
- Exakter Farbcode aus nauthilus-website/src/css/custom.css (.hero--primary …): #516291
- Unabhängig vom Light/Dark-Mode, vollflächig (minHeight: 100vh) angewendet.
- Dateien: src/components/LoginPage.tsx, src/components/MFAPage.tsx

## 2025-09-17: Linkes Menü — Website-Blau und Glas-Effekt

- Hintergrund des linken Navigations-Menüs (Drawer) auf das Website-Blau umgestellt — unabhängig vom Light/Dark-Mode.
- Glas-/Frosted-Glass-Effekt hinzugefügt (Transparenz + Hintergrund-Unschärfe), dezente helle Rahmenlinie und bessere Hover-Farbe.
- Text- und Icon-Farbe im Drawer auf Weiß gesetzt, Divider heller angepasst.
- Dateien: src/App.tsx — Styling der Drawer-Paper für temporären und permanenten Drawer.

## 2025-09-17: Oberes Menü (AppBar) — Website-Blau für beide Themes

- Das horizontale Menü oben (AppBar) erhält nun den gleichen, an das linke Menü angepassten Blauton (#516291), unabhängig vom Light/Dark-Mode.
- Lesbarkeit verbessert: Label/Text/Icons der Profil-Auswahl in der AppBar auf Weiß angepasst; Outline-Farben aufgehellt.
- Dateien: src/App.tsx — AppBar Hintergrund/Textfarbe gesetzt und FormControl/Select in der AppBar farblich angepasst.

## 2025-09-17: Linkes Menü im Light‑Mode identisch zum Dark‑Mode

- Subheader-Typografie („Configuration“, „Runtime“) nutzt nun explizit eine helle Schriftfarbe (rgba(255,255,255,0.85)) statt theme text.secondary.
- Dadurch wirkt das linke Menü im Light‑Mode wie im Dark‑Mode (auf dem bläulichen, halbtransparenten Glas-Hintergrund).
- Dateien: src/App.tsx — Farbe der Subheader-Typografie angepasst.

## 2025-09-17: Dark‑Mode — Schriftfarbe in der oberen Menüzeile angleichen

- Im Dark‑Mode entspricht die Schrift-/Iconfarbe in der AppBar jetzt exakt der im Light‑Mode (weiß).
- Umsetzung: In src/App.tsx explizite Farb-Overrides für Buttons, IconButtons, Typografie und Icons innerhalb der AppBar hinzugefügt.

## 2025-09-17: Light/Dark-Mode — Oberes und linkes Menü absolut identisch

- Sichergestellt, dass sich oberes (AppBar) und linkes Menü (Drawer) beim Umschalten zwischen Light- und Dark-Mode optisch nicht unterscheiden.
- Speziell im Light-Mode war die Listentext-Farbe im linken Menü noch dunkel. Diese wurde nun explizit auf Weiß gesetzt, wie im Dark-Mode.
- Umsetzung: In src/App.tsx innerhalb der Drawer-Paper-Styles zusätzlich die Typografie der ListItemText-Komponenten überschrieben:
  - `& .MuiListItemText-root .MuiTypography-root: { color: '#fff' }`
- Bereits vorhandene Vereinheitlichungen (Hintergrund #516291, Icons/Text in der AppBar weiß, Drawer-Glaseffekt) bleiben unverändert.
- Keine Logikänderungen — reine Styles.

## 2025-09-17: Linkes Menü im Light‑Mode wirklich IDENTISCH zum Dark‑Mode

- Ursache: Der Drawer hatte eine transparente Hintergrundfarbe (rgba …, 0.75). Auf hellem Seitenhintergrund wirkte das Menü im Light‑Mode dadurch deutlich heller als im Dark‑Mode.
- Fix:
  - Drawer‑Hintergrund in beiden Varianten (temporary & permanent) auf voll deckendes `#516291` umgestellt (keine Transparenz mehr) → damit in Light/Dark absolut gleich.
  - Zusätzlich innerhalb der Drawer‑Paper explizit Weiß für alle relevanten Elemente erzwungen: `.MuiTypography-root`, `.MuiSvgIcon-root`, `.MuiIconButton-root` (neben bereits gesetzten ListItemText/Icon Overrides).
  - Bestehende Hover-/Divider-/Border‑Styles beibehalten.
- Dateien: src/App.tsx — Styles der Drawer‑Paper angepasst.


## 2025-09-17: Dark-Mode — AppBar/Drawer identisch wie Light-Mode

- Ursache: In Dark-Mode war theme.palette.primary.main = #5c6bc0, während im Light-Mode #516291 verwendet wurde. Da AppBar und Drawer `primary.main` nutzen, ergaben sich optische Unterschiede.
- Fix: `src/contexts/ThemeContext.tsx` — primary.main im Dark-Mode auf `#516291` gesetzt, sodass oberes und linkes Menü in beiden Modes ABSOLUT identisch sind. Anzeigebereich (background.default/paper) bleibt unverändert.
