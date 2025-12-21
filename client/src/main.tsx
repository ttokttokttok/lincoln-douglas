// Polyfills for simple-peer (must be first)
import { Buffer } from 'buffer';
import process from 'process';
window.Buffer = Buffer;
window.process = process;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
