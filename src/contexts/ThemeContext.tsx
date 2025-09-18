import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, PaletteMode } from '@mui/material';

// Define the theme context type
interface ThemeContextType {
  mode: PaletteMode;
  toggleColorMode: () => void;
}

// Create the context with a default value
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Storage key for the theme preference
const THEME_STORAGE_KEY = 'nauthilus-theme-mode';

// Provider component
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps): React.JSX.Element => {
  // Initialize theme mode from localStorage or default to 'light'
  const [mode, setMode] = useState<PaletteMode>(() => {
    const storedMode = localStorage.getItem(THEME_STORAGE_KEY);
    return (storedMode === 'dark' || storedMode === 'light') ? storedMode : 'light';
  });

  // Create theme based on current mode
  const theme = createTheme({
    palette: {
      mode,
      ...(mode === 'dark' && {
        // Customize colors for dark mode
        primary: {
          main: '#516291', // unify menu/AppBar color with light mode to keep menus identical across themes
        },
        background: {
          default: '#0f172a', // deep slate-ish background
          paper: '#1b2a4a', // deep blue for Paper backgrounds
        },
        text: {
          primary: 'rgba(255,255,255,0.92)', // higher contrast for readability
          secondary: 'rgba(255,255,255,0.80)', // increase contrast vs default 0.6-0.7
        },
        divider: 'rgba(255,255,255,0.20)', // slightly stronger dividers
      }),
      ...(mode === 'light' && {
        // Customize colors for light mode aligned with nauthilus-website
        primary: {
          main: '#516291', // menu/AppBar blue
          contrastText: '#ffffff',
        },
        background: {
          default: '#e0e5ef', // website body background
          paper: '#ffffff', // white cards on light bg
        },
        text: {
          primary: '#0f172a', // near-black for high contrast on light
          secondary: '#334155', // dark slate for secondary text
        },
        divider: 'rgba(15,23,42,0.18)',
      }),
    },
    components: {
      // Global Paper override to ensure all Paper boxes use cohesive backgrounds per mode
      MuiPaper: {
        styleOverrides: {
          root: {
            ...(mode === 'dark' && {
              backgroundColor: '#1b2a4a', // deep blue paper background
              color: 'rgba(255,255,255,0.92)',
            }),
            ...(mode === 'light' && {
              backgroundColor: '#ffffff', // white paper on light background
              color: '#0f172a',
            }),
          },
        },
      },
      // Improve default typography contrast slightly
      MuiTypography: {
        styleOverrides: {
          root: {
            color: mode === 'dark' ? 'rgba(255,255,255,0.92)' : '#0f172a',
          },
        },
      },
      // Customize default button styling for both modes
      MuiButton: {
        styleOverrides: {
          // Target default-looking buttons to harmonize with the menu/paper blue
          text: {
            ...(mode === 'dark' && {
              color: '#e0e7ff', // soft light blue text
              '&:hover': {
                backgroundColor: 'rgba(81, 98, 145, 0.08)', // subtle blue hover
              },
            }),
            ...(mode === 'light' && {
              color: '#516291', // menu blue text
              '&:hover': {
                backgroundColor: 'rgba(81, 98, 145, 0.06)', // very subtle blue hover on light
              },
            }),
          },
          outlined: {
            ...(mode === 'dark' && {
              borderColor: '#516291', // menu blue
              color: '#e0e7ff', // readable on dark backgrounds
              '&:hover': {
                borderColor: '#5d6fa3', // slightly lighter on hover
                backgroundColor: 'rgba(81, 98, 145, 0.12)', // subtle blue hover fill
              },
            }),
            ...(mode === 'light' && {
              borderColor: '#516291',
              color: '#516291',
              '&:hover': {
                borderColor: '#5d6fa3',
                backgroundColor: 'rgba(81, 98, 145, 0.08)',
              },
            }),
          },
          contained: {
            ...(mode === 'dark' && {
              backgroundColor: '#516291', // match AppBar/menu
              color: '#ffffff', // high contrast text
              '&:hover': {
                backgroundColor: '#5d6fa3', // slightly lighter on hover
              },
            }),
            ...(mode === 'light' && {
              backgroundColor: '#516291', // match website menu
              color: '#ffffff',
              '&:hover': {
                backgroundColor: '#5d6fa3',
              },
            }),
          },
          // Ensure the default variant (no color prop specified) gets the new styling as well
          containedPrimary: {
            ...(mode === 'dark' && {
              backgroundColor: '#516291',
              color: '#ffffff',
              '&:hover': {
                backgroundColor: '#5d6fa3',
              },
            }),
            ...(mode === 'light' && {
              backgroundColor: '#516291',
              color: '#ffffff',
              '&:hover': {
                backgroundColor: '#5d6fa3',
              },
            }),
          },
        },
      },
    },
  });

  // Toggle between light and dark modes
  const toggleColorMode = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_STORAGE_KEY, newMode);
      return newMode;
    });
  };

  // Provide the context value
  const contextValue: ThemeContextType = {
    mode,
    toggleColorMode,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Custom hook to use the theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
