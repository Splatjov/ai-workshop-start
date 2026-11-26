import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'drawably/style.css';
import 'drawably/font.css';
import './style.css';
import { createBrowserBackend } from '../src/browser.ts';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App backend={createBrowserBackend()} />
  </StrictMode>,
);
