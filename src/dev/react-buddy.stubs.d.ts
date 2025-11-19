// Minimal ambient module declarations to satisfy TypeScript when
// optional dev-only dependencies are not installed locally.
// These stubs are intentionally lightweight and only cover the
// symbols used in our src/dev/* files.

declare module '@react-buddy/ide-toolbox' {
  import * as React from 'react';
  // Minimal type to match the usage in src/dev/useInitial.ts
  export type InitialHookStatus = {
    loading: boolean;
    error: boolean;
  };
  export const Palette: React.FC<React.PropsWithChildren<unknown>>;
  export const Category: React.FC<{ name: string } & React.PropsWithChildren<unknown>>;
  export const Component: React.FC<{ name: string } & React.PropsWithChildren<unknown>>;
  export const Variant: React.FC<React.PropsWithChildren<unknown>>;
  export const Previews: React.FC<{ palette?: React.ReactNode } & React.PropsWithChildren<unknown>>;
  export const ComponentPreview: React.FC<{ path: string } & React.PropsWithChildren<unknown>>;
}

declare module '@react-buddy/palette-mui' {
  import * as React from 'react';
  const MUIPalette: React.FC;
  export default MUIPalette;
}
