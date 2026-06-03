import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './style.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <Suspense>
      <App />
    </Suspense>
  </StrictMode>,
);
