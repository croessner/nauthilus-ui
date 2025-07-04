// Add custom properties to the Window interface
interface Window {
  __settingsState?: {
    loaded: boolean;
    profileName: string;
    connectionUrl: string;
  };
}
