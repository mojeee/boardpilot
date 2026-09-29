import { describe, expect, it } from 'vitest';
import { BOARDS, PARTS, getBoard } from '@shared/board';
import { checkWiring } from '@shared/wiring';
import { checkCode } from '@shared/codeCheck';
import { IT } from '@shared/i18n';
import { TEMPLATES, TemplateRun, stepLines, templateCode, templateFits, templatePin, templateScene, type SimAction, type StoryItem } from '@shared/templates';

const boards = Object.values(BOARDS);

/** Every text of one kind in a template's behaviour model (including inside if/else). */
function simTexts(actions: SimAction[], key: 'step' | 'event'): string[] {
  return actions.flatMap((a) => ('if' in a ? [...simTexts(a.then, key), ...simTexts(a.else ?? [], key)] : key in a ? [(a as Record<string, string>)[key]] : []));
}

function run(id: string, boardId: string, loops: number): StoryItem[] {
  const tpl = TEMPLATES.find((x) => x.id === id)!;
  const board = getBoard(boardId);
  const r = new TemplateRun(tpl, board, templateScene(tpl, board, PARTS));
  const out: StoryItem[] = [];
  for (let i = 0; i < loops; i++) out.push(...r.next());
  return out;
}

describe('template projects', () => {
  it('has the five first templates', () => {
    expect(TEMPLATES.map((x) => x.id).sort()).toEqual(['blink-button', 'distance-meter', 'motion-alarm', 'plant-watering', 'weather-station']);
  });

  describe.each(TEMPLATES)('$id', (tpl) => {
    it('uses parts from the library and names every pin it uses', () => {
      for (const p of tpl.parts) expect(PARTS[p.partId], p.partId).toBeTruthy();
      for (const [name, ref] of Object.entries(tpl.pins)) {
        expect(tpl.parts.some((p) => p.id === ref.part), name).toBe(true);
        expect(PARTS[tpl.parts.find((p) => p.id === ref.part)!.partId].pins.some((p) => p.name === ref.pin), name).toBe(true);
      }
      expect(tpl.sources.length).toBeGreaterThan(0);
    });

    it.each(boards.map((b) => [b.id]))('builds, wires and codes itself on %s', (boardId) => {
      const board = getBoard(boardId);
      if (templateFits(tpl, board)) return;
      const scene = templateScene(tpl, board, PARTS);
      for (const name of Object.keys(tpl.pins)) expect(templatePin(tpl, scene, board, name), `${name} on ${boardId}`).toBeTruthy();
      const code = templateCode(tpl, board, scene);
      expect(code).not.toMatch(/\{[A-Z_]+(:\w+)?\}|: not wired \*\//);
      // The generated project passes both checkers: no errors in the wiring or in the code.
      const wiringErrors = checkWiring(scene, board, PARTS).filter((f) => f.severity === 'error');
      expect(wiringErrors.map((f) => f.message), boardId).toEqual([]);
      const codeErrors = checkCode(code, scene, board, PARTS).filter((f) => f.severity !== 'info');
      expect(codeErrors.map((f) => f.message), boardId).toEqual([]);
      // Every step the simulator tells is a probe.step() in the code; every event is a probe.event().
      const lines = stepLines(code);
      for (const s of simTexts(tpl.sim.loop, 'step')) expect(lines.has(s), s).toBe(true);
      for (const e of simTexts(tpl.sim.loop, 'event')) expect(code, e).toContain(`probe.event("${e}")`);
    });
  });

  it('has Italian for every text a template shows', () => {
    const texts: string[] = [];
    const walk = (a: SimAction[]) =>
      a.forEach((x) => {
        if ('if' in x) {
          walk(x.then);
          walk(x.else ?? []);
        }
        if ('step' in x) texts.push(x.step);
        if ('event' in x) texts.push(x.event);
        if ('read' in x) texts.push(x.as);
        if ('show' in x) texts.push(x.text);
      });
    for (const tp of TEMPLATES) {
      texts.push(tp.name, tp.summary, ...tp.learn, ...(tp.notes ?? []));
      walk(tp.sim.loop);
    }
    expect(texts.filter((s) => !IT[s])).toEqual([]);
  });

  it('blink and button: blinks, and the LED stays on while the button is held', () => {
    const story = run('blink-button', 'esp32-devkitc-30', 40);
    const led = story.filter((s) => s.kind === 'pin');
    expect(led.length).toBeGreaterThan(4);
    expect(story.some((s) => s.kind === 'event' && /held/.test(s.text))).toBe(true);
    expect(story.find((s) => s.kind === 'pin')?.targets).toEqual(expect.arrayContaining(['part:led1']));
  });

  it('motion alarm: goes off on motion and stops after 3 s', () => {
    const story = run('motion-alarm', 'rpi-pico', 80);
    const on = story.find((s) => s.kind === 'event' && /Motion detected/.test(s.text));
    const off = story.find((s) => s.kind === 'event' && /Alarm off/.test(s.text));
    expect(on && off).toBeTruthy();
    expect(off!.t - on!.t).toBeGreaterThanOrEqual(3000);
    expect(off!.t - on!.t).toBeLessThan(3600);
  });

  it('plant watering: pumps for 3 s when dry, then waits and the soil gets wetter', () => {
    const story = run('plant-watering', 'arduino-uno-r3', 60);
    const pumpOn = story.find((s) => s.kind === 'pin' && s.level === 1);
    const pumpOff = story.find((s) => s.kind === 'pin' && s.level === 0 && s.t > (pumpOn?.t ?? 0));
    expect(pumpOn && pumpOff).toBeTruthy();
    expect(pumpOff!.t - pumpOn!.t).toBeGreaterThanOrEqual(3000);
    const moisture = story.filter((s) => s.kind === 'value').map((s) => s.value ?? 0);
    expect(Math.max(...moisture.slice(-10))).toBeGreaterThan(40);
    // Only one watering within the 30 s rest.
    const ons = story.filter((s) => s.kind === 'pin' && s.level === 1).map((s) => s.t);
    for (let i = 1; i < ons.length; i++) expect(ons[i] - ons[i - 1]).toBeGreaterThanOrEqual(33000);
  });

  it('weather station and distance meter show values on their displays', () => {
    expect(run('weather-station', 'esp32-s3-devkitc-1', 3).some((s) => s.kind === 'show' && s.part === 'oled1')).toBe(true);
    const d = run('distance-meter', 'arduino-nano', 80);
    expect(d.some((s) => s.kind === 'show' && s.part === 'disp1')).toBe(true);
    expect(d.some((s) => s.kind === 'event' && /10 cm/.test(s.text))).toBe(true);
  });
});
