import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { initLanguage, useLang } from './state/lang';

initLanguage();

/** Re-mounts the UI when the language changes, so every string is re-rendered. App state lives in stores. */
function Root() {
  const lang = useLang((s) => s.lang);
  return <App key={lang} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
