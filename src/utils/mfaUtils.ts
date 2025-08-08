import axios from 'axios';

// TOTP API functions
export const setupTOTP = async (username: string): Promise<{ secret: string, qrCode: string }> => {
  try {
    const response = await axios.post('/api/auth/totp/setup', { username });
    return response.data;
  } catch (error) {
    console.error('Error setting up TOTP:', error);
    throw error;
  }
};

export const verifyTOTP = async (username: string, token: string): Promise<boolean> => {
  try {
    const response = await axios.post('/api/auth/totp/verify', { username, token });
    return response.status === 200;
  } catch (error) {
    console.error('Error verifying TOTP:', error);
    return false;
  }
};

export const disableTOTP = async (username: string): Promise<boolean> => {
  try {
    const response = await axios.post('/api/auth/totp/disable', { username });
    return response.status === 200;
  } catch (error) {
    console.error('Error disabling TOTP:', error);
    return false;
  }
};

// WebAuthn API functions
export const beginWebAuthnRegistration = async (username: string): Promise<{ publicKey: PublicKeyCredentialCreationOptions, sessionData: string }> => {
  try {
    const response = await axios.get(`/api/auth/webauthn/begin-registration?username=${encodeURIComponent(username)}`);

    // Extract the publicKey and sessionData from the response
    const { publicKey, sessionData } = response.data || {};

    if (!publicKey) {
      throw new Error('Server response missing publicKey data');
    }

    // Handle nested publicKey structure if present
    const publicKeyCredentialCreationOptions = publicKey.publicKey || publicKey;

    // Convert challenge from base64 to ArrayBuffer
    if (publicKeyCredentialCreationOptions.challenge) {
      publicKeyCredentialCreationOptions.challenge = base64ToArrayBuffer(publicKeyCredentialCreationOptions.challenge);
    } else {
      console.error('WebAuthn registration: Missing challenge in server response');
      throw new Error('Missing challenge in server response for WebAuthn registration');
    }

    // Convert user.id from base64 to ArrayBuffer
    if (publicKeyCredentialCreationOptions.user && publicKeyCredentialCreationOptions.user.id) {
      publicKeyCredentialCreationOptions.user.id = base64ToArrayBuffer(publicKeyCredentialCreationOptions.user.id);
    }

    // Convert excludeCredentials.id from base64 to ArrayBuffer
    if (publicKeyCredentialCreationOptions.excludeCredentials) {
      publicKeyCredentialCreationOptions.excludeCredentials = publicKeyCredentialCreationOptions.excludeCredentials.map((credential: any) => {
        return {
          ...credential,
          id: base64ToArrayBuffer(credential.id),
        };
      });
    }

    return { publicKey: publicKeyCredentialCreationOptions, sessionData: sessionData || '' };
  } catch (error) {
    console.error('Error beginning WebAuthn registration:', error);
    throw error;
  }
};

export const finishWebAuthnRegistration = async (credential: PublicKeyCredential, name: string, sessionData: string): Promise<boolean> => {
  try {
    if (!credential) {
      console.error('Error finishing WebAuthn registration: credential is undefined');
      return false;
    }

    // Ensure we have the required credential properties
    if (!credential.response || 
        !(credential.response as AuthenticatorAttestationResponse).attestationObject || 
        !(credential.response as AuthenticatorAttestationResponse).clientDataJSON) {
      console.error('Error finishing WebAuthn registration: credential response is missing required properties');
      return false;
    }

    // Convert ArrayBuffer to base64
    const credentialResponse = {
      id: credential.id,
      type: credential.type,
      rawId: arrayBufferToBase64((credential.rawId as ArrayBuffer)),
      response: {
        attestationObject: arrayBufferToBase64((credential.response as AuthenticatorAttestationResponse).attestationObject),
        clientDataJSON: arrayBufferToBase64((credential.response as AuthenticatorAttestationResponse).clientDataJSON),
      },
      name: name || 'Security Key', // Provide a default name if none is provided
      sessionData: sessionData || '', // Ensure sessionData is never undefined
    };

    const response = await axios.post('/api/auth/webauthn/finish-registration', credentialResponse);
    return response.status === 200;
  } catch (error) {
    console.error('Error finishing WebAuthn registration:', error);
    return false;
  }
};

export const beginWebAuthnLogin = async (username: string): Promise<PublicKeyCredentialRequestOptions> => {
  try {
    const response = await axios.get(`/api/auth/webauthn/begin-login?username=${encodeURIComponent(username)}`);

    // Extract the response data
    const responseData = response.data;

    if (!responseData) {
      throw new Error('Server response missing data for login');
    }

    // Handle nested publicKey structure if present
    const publicKeyCredentialRequestOptions = responseData.publicKey ? 
      (responseData.publicKey.publicKey || responseData.publicKey) : 
      responseData;

    // Convert challenge from base64 to ArrayBuffer
    if (publicKeyCredentialRequestOptions.challenge) {
      publicKeyCredentialRequestOptions.challenge = base64ToArrayBuffer(publicKeyCredentialRequestOptions.challenge);
    } else {
      console.error('WebAuthn login: Missing challenge in server response');
      throw new Error('Missing challenge in server response for WebAuthn login');
    }

    // Convert allowCredentials.id from base64 to ArrayBuffer
    if (publicKeyCredentialRequestOptions.allowCredentials) {
      publicKeyCredentialRequestOptions.allowCredentials = publicKeyCredentialRequestOptions.allowCredentials.map((credential: any) => {
        return {
          ...credential,
          id: credential.id ? base64ToArrayBuffer(credential.id) : new ArrayBuffer(0),
        };
      });
    }

    return publicKeyCredentialRequestOptions;
  } catch (error) {
    console.error('Error beginning WebAuthn login:', error);
    throw error;
  }
};

export const finishWebAuthnLogin = async (credential: PublicKeyCredential): Promise<boolean> => {
  try {
    if (!credential) {
      console.error('Error finishing WebAuthn login: credential is undefined');
      return false;
    }

    // Ensure we have the required credential properties
    if (!credential.response || 
        !(credential.response as AuthenticatorAssertionResponse).authenticatorData || 
        !(credential.response as AuthenticatorAssertionResponse).clientDataJSON ||
        !(credential.response as AuthenticatorAssertionResponse).signature) {
      console.error('Error finishing WebAuthn login: credential response is missing required properties');
      return false;
    }

    // Convert ArrayBuffer to base64
    const credentialResponse = {
      id: credential.id,
      type: credential.type,
      rawId: arrayBufferToBase64((credential.rawId as ArrayBuffer)),
      response: {
        authenticatorData: arrayBufferToBase64((credential.response as AuthenticatorAssertionResponse).authenticatorData),
        clientDataJSON: arrayBufferToBase64((credential.response as AuthenticatorAssertionResponse).clientDataJSON),
        signature: arrayBufferToBase64((credential.response as AuthenticatorAssertionResponse).signature),
        userHandle: (credential.response as AuthenticatorAssertionResponse).userHandle ? 
          arrayBufferToBase64((credential.response as AuthenticatorAssertionResponse).userHandle as ArrayBuffer) : 
          null,
      },
    };

    const response = await axios.post('/api/auth/webauthn/finish-login', credentialResponse);
    return response.status === 200;
  } catch (error) {
    console.error('Error finishing WebAuthn login:', error);
    return false;
  }
};

export const removeWebAuthnCredential = async (username: string, credentialId: string): Promise<boolean> => {
  try {
    const response = await axios.delete(`/api/auth/webauthn/credential/${encodeURIComponent(credentialId)}?username=${encodeURIComponent(username)}`);
    return response.status === 200;
  } catch (error) {
    console.error('Error removing WebAuthn credential:', error);
    return false;
  }
};

// Helper functions for WebAuthn
export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  if (!base64) {
    console.warn('base64ToArrayBuffer received undefined or empty input');
    return new ArrayBuffer(0);
  }
  const binaryString = window.atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  if (!buffer) {
    console.warn('arrayBufferToBase64 received undefined or empty input');
    return '';
  }

  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch (error) {
    console.error('Error converting ArrayBuffer to base64:', error);
    return '';
  }
};
