import React from 'react';
import { checkConnection as checkConnectionUtil } from '../utils/apiUtils';

// Small utility hook to avoid duplicate code for accessing the latest connection
// instance and providing a stable getter and connection check function.
// Returns stable callbacks: getConnection() and checkConnection(conn?)
export function useConnectionAccess(
  connection: any,
  setConnStatus: (s: 'unknown' | 'connected' | 'disconnected' | 'checking') => void,
  setStatusMessage: (msg: string) => void,
) {
  const connectionRef = React.useRef(connection);
  React.useEffect(() => { connectionRef.current = connection; }, [connection]);

  const getConnection = React.useCallback(() => connectionRef.current, []);

  const checkConnection = React.useCallback(async (conn?: any) => {
    const c = conn ?? connectionRef.current;
    await checkConnectionUtil(c, setConnStatus, (msg: string) => setStatusMessage(msg));
  }, [setConnStatus, setStatusMessage]);

  return { getConnection, checkConnection } as const;
}
