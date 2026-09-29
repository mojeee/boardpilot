// Browser demo only (window.bp.web, see app/web/bpWeb.ts): the "Get the app" chip in the top bar,
// the "Download the app" prompt shown when something needs the computer (a real board, files,
// your own AI key, AI agents), and the AI settings text for the demo. The desktop app never shows
// any of this.

import { useEffect } from 'react';
import { create } from 'zustand';
import { NEEDS_APP_EVENT } from '@shared/api';
import { SITE_URL } from '@shared/brand';
import { getLanguage, t } from '@shared/i18n';
import { LogoMark } from './Logo';
import '../styles/web.css';

export const isWebDemo = () => Boolean(window.bp?.web);

/** The download section of the website, in the language of the app. */
export const downloadUrl = () => `${SITE_URL}${getLanguage() === 'it' ? '/it/' : '/'}#download`;

const usePrompt = create<{ open: boolean; reason: string | null }>(() => ({ open: false, reason: null }));

/** Opens the prompt; `reason` says what needs the app (null: the general invitation). */
export const askForApp = (reason: string | null = null) => usePrompt.setState({ open: true, reason });
const closePrompt = () => usePrompt.setState({ open: false, reason: null });

export function GetAppChip() {
  return (
    <button className="chip web-chip" onClick={() => askForApp()} title={t('This is the browser demo with a simulated board. Get the app to use your own board.')}>
      {t('Browser demo · Get the app')}
    </button>
  );
}

function DownloadButtons({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-actions">
      <button className="btn ghost" onClick={onClose}>
        {t('Keep exploring')}
      </button>
      {/* _top: inside the website's frame this opens the download section of the page itself. */}
      <a className="btn primary" href={downloadUrl()} target="_top" rel="noopener">
        {t('Download BoardPilot')}
      </a>
    </div>
  );
}

export function DownloadAppPrompt() {
  const { open, reason } = usePrompt();
  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent<{ reason?: unknown }>).detail?.reason;
      askForApp(typeof r === 'string' ? r : null);
    };
    window.addEventListener(NEEDS_APP_EVENT, on);
    return () => window.removeEventListener(NEEDS_APP_EVENT, on);
  }, []);
  if (!open) return null;
  return (
    <div className="modal-back" role="dialog" aria-modal onClick={(e) => e.target === e.currentTarget && closePrompt()}>
      <div className="modal web-modal">
        <LogoMark size={36} />
        <h2>{reason ? t('This needs the BoardPilot app') : t('Get the BoardPilot app')}</h2>
        {reason && <p className="web-reason">{reason}</p>}
        <p>{t('This page runs the real app with a simulated board, so you can try everything safely. The app for Mac and Windows, free for 30 days, also works with your own board on USB.')}</p>
        <ul>
          <li>{t('Finds your board, backs it up and flashes it only after you confirm.')}</li>
          <li>{t('Saves your projects, parts and backups on your computer.')}</li>
          <li>{t('Lets you use your own Claude, GPT or Gemini key, kept encrypted.')}</li>
        </ul>
        <DownloadButtons onClose={closePrompt} />
      </div>
    </div>
  );
}

/** AI settings in the browser demo: only the free demo relay; own keys need the app. */
export function WebAiSettings({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" role="dialog" aria-modal onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal web-modal">
        <h2>{t('AI in the browser demo')}</h2>
        <p>{t('Here the assistant uses the free demo AI: an older Gemini model through BoardPilot’s relay, a few requests per minute, for testing only. Don’t send private data.')}</p>
        <p>{t('To use your own Claude, GPT or Gemini key, download the app: it keeps the key encrypted on your computer. A web page cannot keep a key safe.')}</p>
        <DownloadButtons onClose={onClose} />
      </div>
    </div>
  );
}
