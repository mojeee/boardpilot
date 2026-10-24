// The banner above a replayed conversation (it must never pass for a live one) and the picker of
// example conversations shown in New project.

import { useEffect, useState } from 'react';
import type { ChatRecording } from '@shared/chatReplay';
import { getBoard } from '@shared/board';
import { t } from '@shared/i18n';
import { useAi } from '../state/store';
import { playRecording, recordingList, stopReplay, useReplay } from './player';

export function ReplayBar() {
  const { rec, playing, done, speed } = useReplay();
  if (!rec) return null;
  return (
    <div className="replay-bar" role="note">
      <div>
        <b>{t('Recorded conversation')}</b>{' '}
        <span>
          {t('A real chat with Claude ({model}, {date}), replayed in your browser. No AI is called.', { model: rec.model, date: rec.recordedAt })}
        </span>
      </div>
      <div className="row gap wrap">
        {!done && (
          <button className="btn small ghost" onClick={() => useReplay.setState({ playing: !playing })}>
            {playing ? t('Pause') : t('Resume')}
          </button>
        )}
        {!done && (
          <button className="btn small ghost" onClick={() => useReplay.setState({ speed: speed === 1 ? 2 : 1 })} aria-pressed={speed === 2}>
            {speed === 2 ? '2×' : '1×'}
          </button>
        )}
        <button className="btn small ghost" onClick={() => void playRecording(rec)}>
          {t('Replay')}
        </button>
        <button
          className="btn small"
          onClick={() => {
            stopReplay();
            useAi.getState().clear();
          }}
        >
          {done ? t('Try it yourself') : t('Stop')}
        </button>
      </div>
    </div>
  );
}

export function ExampleChats() {
  const [list, setList] = useState<ChatRecording[] | null>(null);
  useEffect(() => {
    let live = true;
    void recordingList().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, []);
  if (!list?.length) return null;
  return (
    <details className="bom-details">
      <summary className="label">{t('Watch an example conversation ({n})', { n: list.length })}</summary>
      <div className="example-chats">
        {list.map((r) => (
          <button key={r.id} className="example-chat" onClick={() => void playRecording(r)}>
            <b>{r.title}</b>
            <span className="small dim">{r.blurb}</span>
            <span className="mono small dim">{getBoard(r.board).name}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
