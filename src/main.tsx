import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './app/router';
import './styles/tokens.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('no #root element to mount into');
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
