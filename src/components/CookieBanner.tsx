import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Link as MUILink, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

// Types for translations
interface ConsentTranslation {
  text: string;
  privacyLinkText: string;
  ok: string;
}

type ConsentTranslations = Record<string, ConsentTranslation>;

const CONSENT_STORAGE_KEY = 'cookieConsentAccepted';

function pickLanguage(available: string[], navigatorLanguages: readonly string[] | undefined, navigatorLanguage: string | undefined): string {
  // Normalize codes to lower-case and strip region (e.g., de-DE -> de)
  const preferred: string[] = [];
  if (navigatorLanguages && navigatorLanguages.length) {
    preferred.push(...navigatorLanguages.map((l) => l.toLowerCase()));
  } else if (navigatorLanguage) {
    preferred.push(navigatorLanguage.toLowerCase());
  }
  // expand to base codes
  const expanded: string[] = [];
  for (const code of preferred) {
    expanded.push(code);
    const base = code.split('-')[0];
    if (base && base !== code) expanded.push(base);
  }
  // unique
  const seen = new Set<string>();
  const ordered = expanded.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
  // find first matching available code
  for (const code of ordered) {
    if (available.includes(code)) return code;
  }
  // Try matching base codes of available list to preferred list
  const availableBases = available.map((a) => a.split('-')[0]);
  for (const code of ordered) {
    const base = code.split('-')[0];
    const idx = availableBases.indexOf(base);
    if (idx >= 0) return available[idx];
  }
  return 'en';
}

const CookieBanner: React.FC = () => {
  const [accepted, setAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Local fallback translations in case the API is unavailable
  const fallbackTranslations: ConsentTranslations = useMemo(() => ({
    en: { text: 'We use strictly necessary cookies required to operate this application.', privacyLinkText: 'Privacy Policy', ok: 'OK' },
    de: { text: 'Wir setzen technisch notwendige Cookies ein, die für den Betrieb dieser Anwendung erforderlich sind.', privacyLinkText: 'Datenschutzerklärung', ok: 'OK' },
    fr: { text: 'Nous utilisons des cookies strictement nécessaires au fonctionnement de cette application.', privacyLinkText: 'Politique de confidentialité', ok: 'OK' },
    es: { text: 'Utilizamos cookies estrictamente necesarias para el funcionamiento de esta aplicación.', privacyLinkText: 'Política de privacidad', ok: 'OK' },
    it: { text: 'Utilizziamo cookie strettamente necessari al funzionamento di questa applicazione.', privacyLinkText: 'Informativa sulla privacy', ok: 'OK' },
    nl: { text: 'We gebruiken strikt noodzakelijke cookies die nodig zijn voor het functioneren van deze applicatie.', privacyLinkText: 'Privacybeleid', ok: 'OK' },
    pl: { text: 'Używamy ciasteczek niezbędnych do działania tej aplikacji.', privacyLinkText: 'Polityka prywatności', ok: 'OK' },
  }), []);

  const [translations, setTranslations] = useState<ConsentTranslations | null>(null);
  const t: ConsentTranslations = translations || fallbackTranslations;
  const availableLangs = useMemo(() => Object.keys(t), [t]);
  const lang = useMemo(() => pickLanguage(availableLangs, navigator.languages as any, navigator.language), [availableLangs]);
  const i18n = t[lang] || t['en'];

  useEffect(() => {
    // Load translations from API (public endpoint). If it fails, we'll use fallbacks.
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/i18n/cookie-consent', { credentials: 'include' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = (await resp.json()) as ConsentTranslations;
        if (!cancelled && json && typeof json === 'object') {
          setTranslations(json);
        }
      } catch {
        // keep fallbackTranslations
      }
    })();

    // if localStorage was modified elsewhere
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_STORAGE_KEY) {
        setAccepted(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors (e.g., disabled cookies); fall back to in-memory state
    }
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <Box
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.snackbar,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        boxShadow: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: '1200px',
          mx: 'auto',
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="body2" sx={{ mr: 'auto' }}>
          {i18n.text}{' '}
          <MUILink component={RouterLink} to="/legal/privacy">
            {i18n.privacyLinkText}
          </MUILink>
          .
        </Typography>
        <Button variant="contained" size="small" onClick={handleAccept}>
          {i18n.ok}
        </Button>
      </Box>
    </Box>
  );
};

export default CookieBanner;
