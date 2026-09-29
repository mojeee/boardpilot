// Settings → "AI agents (MCP)": the switch that lets Claude Code, Cursor or Claude Desktop use
// BoardPilot's measurements, and the command to add it. Off by default.

import { useEffect, useState } from 'react';
import type { McpStatus } from '@shared/api';
import { t } from '@shared/i18n';

export function McpSettings() {
  const [st, setSt] = useState<McpStatus | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void window.bp.mcp.status().then(setSt);
  }, []);
  if (!st) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(st.claudeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mcp-settings">
      <div className="label">{t('AI agents (MCP)')}</div>
      <label className="row gap small">
        <input type="checkbox" checked={st.enabled} onChange={async (e) => setSt(await window.bp.mcp.setEnabled(e.target.checked))} />
        <span>{t('Let AI coding agents (Claude Code, Cursor, Claude Desktop) use this board through BoardPilot')}</span>
      </label>
      <p className="small dim">
        {t('They can read measurements, board and part data and the wiring checks. Anything that writes to the board still needs your click here. Local only: nothing leaves this computer.')}
      </p>
      {st.enabled && (
        <>
          <div className="small">{t('Add it to Claude Code:')}</div>
          <div className="row gap">
            <code className="mcp-cmd mono small">{st.claudeCode}</code>
            <button className="btn small" onClick={copy}>
              {copied ? t('Copied') : t('Copy')}
            </button>
          </div>
          <p className="small dim">{t('Other clients: run {cmd} as a stdio MCP server. When BoardPilot is closed, it runs without a window and refuses every write.', { cmd: st.command })}</p>
        </>
      )}
    </div>
  );
}
