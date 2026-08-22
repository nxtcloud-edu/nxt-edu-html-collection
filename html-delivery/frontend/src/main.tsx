import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/global.css';
import './styles/gallery.css';
import './styles/workflow.css';
import './styles/admin.css';
import './styles/admin-pagination.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
