// Take or pick a photo of a part; the AI suggests what it is and the user confirms.

import { useRef, useState } from 'react';
import type { PhotoRecognition } from '@shared/types';
import { PARTS } from '@shared/board';
import { Icon } from './Icon';

type Media = 'image/jpeg' | 'image/png' | 'image/webp';

export function PhotoInput({ onConfirm, compact }: { onConfirm: (partId: string, name: string) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoRecognition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const mt = (['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ? f.type : 'image/jpeg') as Media;
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result);
      setPreview(url);
      setResult(null);
      setError(null);
      setBusy(true);
      const r = await window.bp.ai.recognize(url.split(',')[1] ?? '', mt);
      setBusy(false);
      if (r.ok) setResult(r.value);
      else setError(`${r.error.humanMessage} ${r.error.hint}`);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="photo-input">
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {!preview && (
        <button className={`btn ${compact ? 'small' : ''}`} onClick={() => input.current?.click()}>
          <Icon name="camera" size={16} /> Photo of the part
        </button>
      )}
      {preview && (
        <div className="photo-card">
          <img src={preview} alt="Your part" />
          <div className="photo-body">
            {busy && <div className="dim">Looking at the photo…</div>}
            {error && <div className="err-text">{error}</div>}
            {result && (
              <>
                <div className="row gap">
                  <span className="conf conf-suggestion">suggestion</span>
                  <b>{result.partId ? PARTS[result.partId].name : result.name}</b>
                </div>
                <p className="small">{result.reasoning}</p>
                {result.alternatives.length > 0 && <p className="small dim">Could also be: {result.alternatives.join(', ')}</p>}
                <div className="row gap">
                  {result.partId && (
                    <button className="btn small primary" onClick={() => onConfirm(result.partId!, PARTS[result.partId!].name)}>
                      Yes, that’s it
                    </button>
                  )}
                  <button className="btn small ghost" onClick={() => { setPreview(null); setResult(null); }}>
                    No, try again
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
