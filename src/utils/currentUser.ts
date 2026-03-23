import * as userManager from './userManager';

export const getCurrentUserId = async (): Promise<string> => {
  const hintedUsername = userManager.getCurrentUsernameHint();
  if (hintedUsername) {
    return hintedUsername;
  }

  const currentUser = await userManager.getCurrentUser();
  if (!currentUser?.username) {
    throw new Error('Authenticated user not found');
  }

  return currentUser.username;
};
