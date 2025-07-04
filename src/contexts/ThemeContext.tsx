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
        // Customize button colors for dark mode
        primary: {
          main: '#5c6bc0', // A less bright blue
        },
      }),
    },
    components: {
      // Customize default button styling for dark mode
      MuiButton: {
        styleOverrides: {
          // Target only the default variant buttons
          text: {
            ...(mode === 'dark' && {
              color: '#b0b0b0', // Dimmer text color for text buttons
            }),
          },
          outlined: {
            ...(mode === 'dark' && {
              borderColor: '#5c6bc0', // Match with primary color
              color: '#b0b0b0', // Dimmer text color
              '&:hover': {
                borderColor: '#7986cb', // Slightly lighter border on hover
                backgroundColor: 'rgba(92, 107, 192, 0.08)', // Very subtle background on hover
              },
            }),
          },
          contained: {
            ...(mode === 'dark' && {
              backgroundColor: '#8c9eff', // Much lighter blue background for buttons in dark mode
              color: '#000000', // Dark text color for better contrast with a light background
              '&:hover': {
                backgroundColor: '#9fa8da', // Slightly lighter on hover
              },
            }),
          },
          // Ensure the default variant (no color prop specified) gets the new styling
          containedPrimary: {
            ...(mode === 'dark' && {
              backgroundColor: '#8c9eff', // Same lighter background
              color: '#000000', // Dark text color for better contrast
              '&:hover': {
                backgroundColor: '#9fa8da', // Same hover effect
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
