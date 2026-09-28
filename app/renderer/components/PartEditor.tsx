// Part editor: check and correct a part before it enters the library. Imported drafts are
// suggestions; the user confirms every field here (rule 4: honest AI). Live 3D preview on the right.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { PartDef, PartPinRole } from '@shared/types';
import { BUSES, CATEGORIES, PIN_ROLES, SHAPES, validatePartDef } from '@shared/partSchema';
import { ROLE_HEX, partRoleColor } from '@shared/board';
import { t } from '@shared/i18n';
import { usePartsLib } from '../state/partsLib';
import { addPart } from '../state/sceneActions';
import { log } from '../state/store';
import { PartBody, PartPins } from '../three/Parts';

interface EditorReq {
  draft: PartDef | null;
  notes?: string[];
  fromImport?: boolean;
  usedAi?: boolean;
  basis?: 'ai' | 'library' | 'keywords';
  replaceId?: string;
}

export const usePartEditor = create<{ req: EditorReq | null; open(r: EditorReq): void; close(): void }>((set) => ({
  req: null,
  open: (req) => set({ req }),
  close: () => set({ req: null }),
}));

const ROLE_LABEL: Record<PartPinRole, string> = {
  power: 'Power (VCC)',
  ground: 'Ground',
  i2c_sda: 'I2C SDA',
  i2c_scl: 'I2C SCL',
  spi_mosi: 'SPI MOSI',
  spi_miso: 'SPI MISO',
  spi_sck: 'SPI clock',
  spi_cs: 'SPI chip select',
  digital_in: 'Input (ESP32 drives it)',
  digital_out: 'Output (part drives it)',
  analog_out: 'Analog output',
  onewire: 'One-wire data',
  int: 'Interrupt',
  passive: 'Other / not wired',
};

/** Size fields of the 3D box: short label plus a tooltip with the full word. */
const SIZE_FIELDS = [
  { key: 'W', label: 'W (mm)', title: 'Width' },
  { key: 'D', label: 'D (mm)', title: 'Depth' },
  { key: 'H', label: 'H (mm)', title: 'Height' },
] as const;

const EMPTY: PartDef = {
  id: '',
  name: '',
  category: 'sensor',
  pins: [
    { name: 'VCC', role: 'power' },
    { name: 'GND', role: 'ground' },
  ],
  voltage: '3.3',
  model: { shape: 'breakout', size: [15, 16, 1.6], color: '#2E6FD8' },
  keywords: [],
  sources: [],
};

function Preview({ def }: { def: PartDef }) {
  return (
    <Canvas camera={{ position: [0, 38, 42], fov: 35 }} dpr={[1, 2]}>
      <color attach="background" args={['#12171D']} />
      <hemisphereLight args={['#dfe8f5', '#1a2028', 1]} />
      <directionalLight position={[20, 40, 30]} intensity={1.3} />
      <group position={[0, -2, 0]}>
        <PartBody def={def} />
        <PartPins def={def} labels />
      </group>
      <gridHelper args={[80, 32, '#27313c', '#1d252e']} position={[0, -2.01, 0]} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={1.2} />
    </Canvas>
  );
}

export function PartEditor() {
  const req = usePartEditor((s) => s.req);
  const [d, setD] = useState<PartDef>(EMPTY);
  const [addrText, setAddrText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!req) return;
    const draft = req.draft ?? { ...EMPTY, pins: EMPTY.pins.map((p) => ({ ...p })) };
    setD(JSON.parse(JSON.stringify(draft)) as PartDef);
    setAddrText((draft.addresses ?? []).join(', '));
    setErr(null);
    setChecked(!req.fromImport);
  }, [req]);

  if (!req) return null;
  const patch = (p: Partial<PartDef>) => setD((x) => ({ ...x, ...p }));
  const patchModel = (p: Partial<PartDef['model']>) => setD((x) => ({ ...x, model: { ...x.model, ...p } }));
  const setPin = (i: number, p: Partial<PartDef['pins'][number]>) => setD((x) => ({ ...x, pins: x.pins.map((q, j) => (j === i ? { ...q, ...p } : q)) }));
  const movePin = (i: number, dir: -1 | 1) =>
    setD((x) => {
      const pins = [...x.pins];
      const j = i + dir;
      if (j < 0 || j >= pins.length) return x;
      [pins[i], pins[j]] = [pins[j], pins[i]];
      return { ...x, pins };
    });

  const previewDef: PartDef = { ...d, model: { ...d.model, size: [Math.max(d.model.size[0], d.pins.length * 2.54 + 1), d.model.size[1], d.model.size[2]] } };

  const save = async (andAdd: boolean) => {
    const candidate = { ...d, addresses: addrText.split(/[\s,;]+/).filter(Boolean) };
    const v = validatePartDef(candidate);
    if (!v.ok) {
      setErr(t(v.error.humanMessage));
      return;
    }
    setBusy(true);
    const r = await usePartsLib.getState().save(v.value, req.replaceId);
    setBusy(false);
    if (!r.ok) {
      setErr(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
      return;
    }
    log('found', t('“{name}” is in your parts library.', { name: r.value.name }), { source: req.fromImport ? t('import, confirmed by you') : t('added by you') });
    if (andAdd) addPart(r.value.id);
    usePartEditor.getState().close();
  };

  return (
    <div className="modal-back" role="dialog" aria-modal>
      <div className="modal part-editor">
        <div className="row between">
          <h2>{req.replaceId ? t('Edit part') : req.fromImport ? t('Check the imported part') : t('New part')}</h2>
          <button className="close" onClick={() => usePartEditor.getState().close()} aria-label={t('Close')}>
            ×
          </button>
        </div>
        {req.fromImport && (
          <div className="import-notes">
            <span className="conf conf-suggestion">{t('suggestion')}</span>{' '}
            {req.basis === 'library' ? t('Matched to a part in the library from the chip name on the page.') : req.usedAi ? t('Drafted by the AI assistant from the page.') : t('Guessed from keywords on the page.')}{' '}
            {t('Check the pins against the part in your hand before saving.')}
            {!!req.notes?.length && (
              <ul>
                {req.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="pe-grid">
          <div className="pe-form">
            <label>
              {t('Name')}
              <input className="text-in" value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t('HC-SR04 ultrasonic sensor')} />
            </label>
            <div className="pe-row">
              <label>
                {t('Kind')}
                <select className="select" value={d.category} onChange={(e) => patch({ category: e.target.value as PartDef['category'] })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Bus')}
                <select className="select" value={d.bus ?? ''} onChange={(e) => patch({ bus: (e.target.value || undefined) as PartDef['bus'] })}>
                  <option value="">{t('none')}</option>
                  {BUSES.map((b) => (
                    <option key={b} value={b}>
                      {b.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Supply (V)')}
                <input className="text-in mono" value={d.voltage} onChange={(e) => patch({ voltage: e.target.value })} placeholder="3.3-5" />
              </label>
            </div>
            {d.bus === 'i2c' && (
              <label>
                {t('I2C addresses')}
                <input className="text-in mono" value={addrText} onChange={(e) => setAddrText(e.target.value)} placeholder="0x76, 0x77" />
              </label>
            )}
            <div className="label">{t('Pins, in the order printed on the board')}</div>
            <div className="pe-pins">
              {d.pins.map((p, i) => (
                <div key={i} className="pe-pin">
                  <span className="swatch" style={{ background: ROLE_HEX[partRoleColor(p.role)] }} />
                  <input className="text-in mono" value={p.name} onChange={(e) => setPin(i, { name: e.target.value.toUpperCase() })} />
                  <select className="select" value={p.role} onChange={(e) => setPin(i, { role: e.target.value as PartPinRole })}>
                    {PIN_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(ROLE_LABEL[r])}
                      </option>
                    ))}
                  </select>
                  <button className="btn icon small" title={t('Move up')} onClick={() => movePin(i, -1)}>
                    ↑
                  </button>
                  <button className="btn icon small" title={t('Move down')} onClick={() => movePin(i, 1)}>
                    ↓
                  </button>
                  <button className="btn icon small" title={t('Remove pin')} onClick={() => setD((x) => ({ ...x, pins: x.pins.filter((_, j) => j !== i) }))}>
                    ×
                  </button>
                </div>
              ))}
              <button
                className="btn small ghost"
                disabled={d.pins.length >= 24}
                onClick={() => setD((x) => ({ ...x, pins: [...x.pins, { name: `P${x.pins.length + 1}`, role: 'passive' }] }))}
              >
                {t('Add pin')}
              </button>
            </div>
            <div className="label">{t('3D model')}</div>
            <div className="pe-row">
              <label>
                {t('Shape')}
                <select className="select" value={d.model.shape} onChange={(e) => patchModel({ shape: e.target.value as PartDef['model']['shape'] })}>
                  {SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </label>
              {SIZE_FIELDS.map((f, i) => (
                <label key={f.key} className="narrow" title={t(f.title)}>
                  {t(f.label)}
                  <input
                    className="text-in mono"
                    type="number"
                    value={d.model.size[i]}
                    onChange={(e) => {
                      const size = [...d.model.size] as [number, number, number];
                      size[i] = Number(e.target.value);
                      patchModel({ size });
                    }}
                  />
                </label>
              ))}
              <label className="narrow">
                {t('Color')}
                <input type="color" value={d.model.color} onChange={(e) => patchModel({ color: e.target.value })} />
              </label>
            </div>
            {d.origin?.url && (
              <p className="small dim">
                {t('Source: {url}', { url: d.origin.url })}
              </p>
            )}
          </div>
          <div className="pe-preview">
            <Preview def={previewDef} />
            {d.image && <img className="pe-photo" src={d.image} alt={t('Product photo')} title={t('Product photo')} />}
          </div>
        </div>
        {err && <p className="err-text">{err}</p>}
        {req.fromImport && (
          <label className="check small">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> {t('I checked the pins and roles against the real part.')}
          </label>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => usePartEditor.getState().close()}>
            {t('Cancel')}
          </button>
          <button className="btn" disabled={busy || !checked} onClick={() => save(false)}>
            {t('Save to library')}
          </button>
          <button className="btn primary" disabled={busy || !checked} onClick={() => save(true)}>
            {t('Save and add to project')}
          </button>
        </div>
      </div>
    </div>
  );
}
