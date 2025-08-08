# Changes

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
