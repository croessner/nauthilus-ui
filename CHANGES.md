# Changes

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
   ```go
   // LoginRequest represents a login request
   type LoginRequest struct {
       Username    string `json:"username" binding:"required"`
       Password    string `json:"password" binding:"required"`
       MfaVerified bool   `json:"mfaVerified"`
   }
   ```

3. Modified the `Login` handler in `auth.go` to check for the `mfaVerified` flag and bypass MFA verification if it's set to true:
   ```go
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
