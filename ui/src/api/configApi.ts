// This file is kept for compatibility with existing code
// but all functionality has been moved to the ConfigContext

import { NauthilusConfig } from '../types/config';

// Placeholder API functions that do nothing
// These are kept to maintain compatibility with existing code
export const configApi = {
  // Get the current configuration
  getConfig: async (): Promise<NauthilusConfig> => {
    throw new Error('This function is deprecated. Use ConfigContext instead.');
  },

  // Update the configuration
  updateConfig: async (config: NauthilusConfig): Promise<NauthilusConfig> => {
    throw new Error('This function is deprecated. Use ConfigContext instead.');
  },

  // Update a specific section of the configuration
  updateConfigSection: async (section: string, data: any): Promise<any> => {
    throw new Error('This function is deprecated. Use ConfigContext instead.');
  }
};

export default configApi;
