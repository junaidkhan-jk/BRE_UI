import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './app/router';
import { SessionProvider } from './app/SessionContext';
import { applyTheme, storedChoice } from './app/theme';
import './styles/tokens.css';
import './styles/app.css';

// Before React mounts, not inside a component. The toggle sets this too, but a component's effect
// runs after the first paint — so the app would render light for a frame and then go dark, which
// on a tool somebody opens fifty times a day is fifty flashes.
applyTheme(storedChoice());

const container = document.getElementById('root');
if (!container) {
  throw new Error('no #root element to mount into');
}

createRoot(container).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
