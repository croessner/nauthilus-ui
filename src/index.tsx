import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initSessionHandlers, removeSessionHandlers } from './utils/session';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

// Initialize session (silent refresh on focus/visibility)
initSessionHandlers();

// Clean up session handlers on page unload/reload
window.addEventListener('beforeunload', removeSessionHandlers);

// Clean up on hot-module replacement in development to avoid duplicate listeners
try {
  const anyImportMeta: any = import.meta as any;
  if (anyImportMeta && anyImportMeta.hot) {
    anyImportMeta.hot.dispose(() => {
      removeSessionHandlers();
    });
  }
} catch {
  // ignore: import.meta may not be available in some build setups
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
