// Global TypeScript declarations

// Extend Window interface to include _env_ property
interface Window {
  _env_?: {
    [key: string]: string;
  };
  __envConfigReady?: Promise<Record<string, string> | undefined>;
}
