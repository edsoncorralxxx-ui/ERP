import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../../../design-system/tokens.css';
import '../../../design-system/components/bundle.css';
// Gráficos 3D e Linha (window.RendaERP), sem dependências.
import '../../../design-system/components/bundle.js';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
