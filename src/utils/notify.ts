// Simple global notification utility for consistent dialogs
// Dispatches events that App.tsx listens to and shows a nice MUI Dialog.

export type SessionExpiredDetail = {
  message?: string;
};

const EVENT_SESSION_EXPIRED = 'nauthilus:session-expired';

export function notifySessionExpired(message?: string) {
  try {
    const detail: SessionExpiredDetail = { message };
    const ev = new CustomEvent<SessionExpiredDetail>(EVENT_SESSION_EXPIRED as any, { detail });
    window.dispatchEvent(ev);
  } catch (e) {
    // Fallback: in case CustomEvent is not supported (very old browsers)
    // eslint-disable-next-line no-alert
    window.alert(message || 'Your session has expired. Please sign in again.');
  }
}

export const NotifyEvents = {
  SESSION_EXPIRED: EVENT_SESSION_EXPIRED,
};
