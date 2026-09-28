// Language switching: English or Italian, remembered on this Mac.

import { create } from 'zustand';
import { setLanguage, type Lang } from '@shared/i18n';
import { useScene } from './store';

const KEY = 'bp.lang';

function initial(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'it' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
}

export const useLang = create<{ lang: Lang }>(() => ({ lang: 'en' }));

export function initLanguage() {
  const l = initial();
  setLanguage(l);
  useLang.setState({ lang: l });
  void window.bp?.app.setLanguage(l);
}

export function changeLanguage(l: Lang) {
  setLanguage(l);
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  void window.bp?.app.setLanguage(l);
  useLang.setState({ lang: l });
  // wiring findings are text built in the current language: rebuild them
  const sc = useScene.getState();
  sc.setScene(sc.scene);
}
