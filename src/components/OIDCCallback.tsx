import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Cookies from 'js-cookie';

const TOKEN_COOKIE_NAME = 'nauthilus_token';
const REFRESH_TOKEN_COOKIE_NAME = 'nauthilus_refresh_token';

const COOKIE_OPTIONS = {
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  sameSite: 'strict' as const,
  path: '/',
};

function getQueryParam(search: string, name: string): string | null {
  const params = new URLSearchParams(search);
  const v = params.get(name);
  return v && v.length > 0 ? v : null;
}

const OIDCCallback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      const token = getQueryParam(location.search, 'token');
      const refreshToken = getQueryParam(location.search, 'refreshToken');
      const expiresAtStr = getQueryParam(location.search, 'expiresAt');

      if (!token) {
        console.error('OIDC callback missing token');
        navigate('/login');
        return;
      }

      const expiresAt = expiresAtStr ? new Date(parseInt(expiresAtStr, 10) * 1000) : new Date(Date.now() + 3600 * 1000);

      Cookies.set(TOKEN_COOKIE_NAME, token, {
        ...COOKIE_OPTIONS,
        expires: expiresAt,
      });

      if (refreshToken) {
        // Default refresh expiry to +24h if not provided
        Cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
          ...COOKIE_OPTIONS,
          expires: new Date(Date.now() + 24 * 3600 * 1000),
        });
      }

      // Go to home
      navigate('/', { replace: true });
    } catch (e) {
      console.error('Failed to process OIDC callback', e);
      navigate('/login');
    }
  }, [location.search, navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      Processing login...
    </div>
  );
};

export default OIDCCallback;
