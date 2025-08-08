# Changes

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
