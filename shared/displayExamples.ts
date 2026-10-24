// Ready-made Display Studio specs: the test patterns used to bring up a new display, and a small
// sensor dashboard. They open from the studio's example list and are used by the tests.

import type { DisplaySpec, PanelInfo } from './displaySpec';
import { rotatedSize } from './displaySpec';

const base = { visibleIf: '', blinkMs: 0 };

/** Bring-up test patterns, each for 3 s, then a live dashboard: sized to the panel. */
export function testPatternSpec(part: string, panel: PanelInfo): DisplaySpec {
  const [W, H] = rotatedSize(panel, 0);
  const big = W >= 160;
  const s = big ? 2 : 1;
  const label = (text: string) => ({ ...base, type: 'text' as const, x: Math.floor(W / 2), y: H - 10 * s, text, size: s, color: '#FFFFFF', align: 'center' as const });
  const full = { x: 0, y: 0, w: W, h: H };
  return {
    title: 'Test patterns',
    part,
    rotation: 0,
    vars: [
      { name: 'temp', source: { sim: 'wave', min: 18, max: 32, periodS: 12 }, unit: '°C', digits: 1, from: '' },
      { name: 'hum', source: { sim: 'wave', min: 35, max: 70, periodS: 17 }, unit: '%', digits: 0, from: '' },
    ],
    screens: [
      { id: 'bars', background: '#000000', elements: [{ ...base, type: 'pattern', ...full, kind: 'colorbars', size: 8, speed: big ? 40 : 20, colors: [] }, label('COLOUR BARS')] },
      { id: 'checker', background: '#000000', elements: [{ ...base, type: 'pattern', ...full, kind: 'checker', size: big ? 20 : 8, speed: big ? 30 : 15, colors: ['#FFFFFF', '#000000'] }] },
      { id: 'gradient', background: '#000000', elements: [{ ...base, type: 'pattern', ...full, kind: 'gradient', size: 1, speed: big ? 60 : 30, colors: [] }, label('GRADIENT')] },
      { id: 'grid', background: '#000000', elements: [{ ...base, type: 'pattern', ...full, kind: 'grid', size: big ? 20 : 8, speed: 0, colors: ['#00FF00', '#000000'] }, { ...base, type: 'rect', ...full, color: '#FF0000', fill: false }] },
      { id: 'bounce', background: '#000000', elements: [{ ...base, type: 'pattern', ...full, kind: 'bounce', size: big ? 14 : 5, speed: big ? 140 : 60, colors: ['#FFFF00', '#000040'] }] },
      { id: 'rings', background: '#000000', elements: [{ ...base, type: 'pattern', ...full, kind: 'rings', size: big ? 16 : 6, speed: big ? 24 : 10, colors: ['#00FFFF', '#000000'] }] },
      {
        id: 'dashboard',
        background: '#000000',
        elements: [
          { ...base, type: 'icon', x: 4 * s, y: 4 * s, name: 'thermometer', scale: s * 2, color: '#FF8040' },
          { ...base, type: 'text', x: 24 * s, y: 6 * s, text: '{temp}°C', size: s * 2, color: '#FFFFFF', align: 'left' },
          { ...base, type: 'bar', x: 4 * s, y: 26 * s, w: W - 8 * s, h: 8 * s, value: 'temp', min: 15, max: 35, color: '#FF8040', vertical: false },
          { ...base, type: 'icon', x: 4 * s, y: 38 * s, name: 'drop', scale: s, color: '#40A0FF' },
          { ...base, type: 'text', x: 16 * s, y: 38 * s, text: 'Humidity {hum}%', size: s, color: '#40A0FF', align: 'left' },
          { ...base, type: 'graph', x: 4 * s, y: 50 * s, w: W - 8 * s, h: Math.max(12, H - 52 * s - 2), value: 'temp', min: 15, max: 35, color: '#00FF80' },
          { ...base, visibleIf: 'temp > 30', blinkMs: 400, type: 'icon', x: W - 12 * s, y: 4 * s, name: 'warning', scale: s, color: '#FF0000' },
        ],
      },
    ],
    start: 'bars',
    transitions: [
      { from: 'bars', to: 'checker', afterMs: 3000, when: '' },
      { from: 'checker', to: 'gradient', afterMs: 3000, when: '' },
      { from: 'gradient', to: 'grid', afterMs: 3000, when: '' },
      { from: 'grid', to: 'bounce', afterMs: 3000, when: '' },
      { from: 'bounce', to: 'rings', afterMs: 3000, when: '' },
      { from: 'rings', to: 'dashboard', afterMs: 3000, when: '' },
      { from: 'dashboard', to: 'bars', afterMs: 12000, when: '' },
    ],
  };
}
