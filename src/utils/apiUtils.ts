/**
 * Utility functions for API operations
 */

/**
 * Prepares authentication parameters for API requests
 * @param connectionConfig - The connection configuration object containing auth settings
 * @returns An object with authType and authValue properties
 */
export const prepareAuthParams = (connectionConfig: any): { authType: string, authValue: string } => {
  let authType = '';
  let authValue = '';

  // Add Basic Auth if enabled
  if (connectionConfig.basic_auth?.enabled && 
      connectionConfig.basic_auth.username && 
      connectionConfig.basic_auth.password) {
    authType = 'basic';
    authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
  }

  // For JWT Auth, use existing token if available
  if (connectionConfig.jwt_auth?.enabled && connectionConfig.jwt_auth.token) {
    authType = 'bearer';
    authValue = connectionConfig.jwt_auth.token;
  }

  return { authType, authValue };
};

/**
 * Extracts a detailed error message from an API response
 * @param response - The Response object from a fetch request
 * @returns A formatted error message string
 */
export const extractErrorMessage = async (response: Response): Promise<string> => {
  const errorData = await response.json().catch(() => ({ error: response.statusText }));

  // Extract more detailed error information if available
  let errorMessage = errorData.error || response.statusText;

  // Add HTTP status code to the error message
  errorMessage = `[${response.status} ${response.statusText}] ${errorMessage}`;

  // Check if there are detailed error information fields
  if (errorData.details) {
    errorMessage = `${errorMessage}: ${errorData.details}`;
  } else if (errorData.code) {
    errorMessage = `${errorMessage} (Code: ${errorData.code})`;
  }

  // Check if there's a more detailed error message in the result field
  if (errorData.result && typeof errorData.result === 'object') {
    if (errorData.result.error) {
      errorMessage = `${errorMessage}: ${errorData.result.error}`;
    } else if (typeof errorData.result === 'string') {
      errorMessage = `${errorMessage}: ${errorData.result}`;
    } else if (JSON.stringify(errorData.result) !== '{}') {
      errorMessage = `${errorMessage}: ${JSON.stringify(errorData.result)}`;
    }
  }

  return errorMessage;
};
