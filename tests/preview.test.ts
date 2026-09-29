import { describe, expect, it } from 'vitest';
import { useScene } from '../app/renderer/state/store';

describe('lesson preview', () => {
  it('gives the project back exactly: scene, undo history and view', () => {
    const st = useScene.getState();
    st.setScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
    st.updateScene((s) => ({ ...s, parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 50] }] }));
    st.updateScene((s) => ({ ...s, parts: [...s.parts, { id: 'led1', partId: 'led-resistor', position: [40, 0, 50] }] }));
    st.undo();
    st.set({ view: '2d' });
    const before = useScene.getState();
    const snapshot = { scene: before.scene, past: before.past, future: before.future, view: before.view };

    before.startPreview({ board: 'rpi-pico', parts: [], wires: [] }, ['pin:GP15'], 'A lesson');
    const during = useScene.getState();
    expect(during.preview).toEqual({ title: 'A lesson' });
    expect(during.scene.board).toBe('rpi-pico');
    expect(during.past).toEqual([]);
    expect(during.view).toBe('3d');

    during.endPreview();
    const after = useScene.getState();
    expect(after.preview).toBeNull();
    expect(after.scene).toBe(snapshot.scene);
    expect(after.past).toBe(snapshot.past);
    expect(after.future).toBe(snapshot.future);
    expect(after.view).toBe('2d');
    // Undo and redo still work on the real project.
    after.redo();
    expect(useScene.getState().scene.parts.map((p) => p.id)).toEqual(['bme1', 'led1']);
  });
});
