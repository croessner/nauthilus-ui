import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../utils/userManager';

const OIDCCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          navigate('/', { replace: true });
          return;
        }
      } catch (e) {
        console.error('Failed to finalize OIDC callback session', e);
      }

      navigate('/login', { replace: true });
    })();
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      Finalizing sign-in...
    </div>
  );
};

export default OIDCCallback;
