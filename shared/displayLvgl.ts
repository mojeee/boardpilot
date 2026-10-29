// Display Studio → LVGL 8.3 code. The same spec as the other targets, written as LVGL objects instead of
// drawing calls, with LovyanGFX as the display driver (the flush callback) on ESP32 and ESP32-S3:
//   screen → lv_obj (a screen), text → lv_label, bar → lv_bar, gauge → lv_arc, graph → lv_chart,
//   icon and bitmap → lv_img, rect/circle → lv_obj, line → lv_line, button → lv_btn (or an invisible lv_obj),
//   visibleIf and blinkMs and the screen changes → one lv_timer, touch → an lv_indev reading the same
//   touch controller code as the other targets (shared/displayTouch.ts).
// LVGL draws with its own anti-aliased widgets and Montserrat fonts, so the result matches the preview in
// layout, colours and behaviour, not pixel for pixel. Test patterns (pattern elements) have no LVGL
// counterpart and are left out.
// The generated code follows the LVGL 8.3 API (lv_disp_draw_buf_t, lv_disp_drv_t, lv_img_dsc_t, lv_timer).

import { dataOf } from './displayAssets';
import { GRAPH_STEP_MS, ICON_BITS } from './displayRender';
import { parseColor, type DisplayElement, type DisplaySpec, type PanelInfo } from './displaySpec';
import { t } from './i18n';

export interface LvglHelpers {
  ident: (s: string) => string;
  fl: (n: number) => string;
  hex: (n: number, w?: number) => string;
  condC: (cond: string) => string;
  byteLines: (bytes: number[], indent?: string) => string[];
}

export interface LvglInput {
  spec: DisplaySpec;
  panel: PanelInfo;
  /** the rotated screen */
  W: number;
  H: number;
  /** names of the screens' indexes, as in the app */
  screenIdx: Map<string, number>;
  touchSet: Set<string>;
  /** a touch controller (or the empty read) is declared above, with bpTouchRead() */
  hasTouchUi: boolean;
  h: LvglHelpers;
}

export interface LvglParts {
  body: string[];
  /** lines of setup() / display_init() after tft.init(), setRotation and the touch begin */
  init: string[];
  notes: string[];
}

/** LVGL's built-in Montserrat sizes the template lv_conf.h turns on. The 5x7 font's size 1-8 maps to the nearest. */
const FONT_PX = [10, 20, 30, 40, 48, 48, 48, 48];
export const LVGL_FONT_SIZES = [10, 20, 30, 40, 48];

const colorHex = (c: string) => {
  const [r, g, b] = parseColor(c);
  return `lv_color_hex(0x${((r << 16) | (g << 8) | b).toString(16).toUpperCase().padStart(6, '0')})`;
};
/** UTF-8 for LVGL (the degree sign is two bytes), octal escapes of three digits so the next character is safe. */
const lvStr = (s: string) => JSON.stringify(s).replace(/°/g, '\\302\\260');
/** A factor that keeps min..max inside LVGL's 16-bit coordinates while keeping decimals. */
const scaleFor = (min: number, max: number) => {
  const m = Math.max(Math.abs(min), Math.abs(max), 1);
  return m * 100 <= 30000 ? 100 : m * 10 <= 30000 ? 10 : 1;
};

/** The template lv_conf.h: only what the generated code uses, 16-bit colour, Arduino's millis() as the tick. */
export function lvConfH(): string {
  return [
    '/* lv_conf.h for the code BoardPilot wrote (LVGL 8.3). Put it in Documents/Arduino/libraries, next to the lvgl folder, */',
    '/* replacing any lv_conf.h there. It turns on only what the generated screens use. */',
    '#if 1  /* enable this file */',
    '#ifndef LV_CONF_H',
    '#define LV_CONF_H',
    '#include <stdint.h>',
    '',
    '#define LV_COLOR_DEPTH 16',
    '#define LV_COLOR_16_SWAP 0  /* the flush callback sends RGB565 through LovyanGFX */',
    '#define LV_MEM_CUSTOM 0',
    '#define LV_MEM_SIZE (48U * 1024U)  /* raise it if you add many widgets */',
    '#define LV_DISP_DEF_REFR_PERIOD 30',
    '#define LV_INDEV_DEF_READ_PERIOD 30',
    '#define LV_TICK_CUSTOM 1',
    '#define LV_TICK_CUSTOM_INCLUDE "Arduino.h"',
    '#define LV_TICK_CUSTOM_SYS_TIME_EXPR (millis())',
    '#define LV_USE_LOG 0',
    '#define LV_USE_ASSERT_NULL 1',
    '',
    '/* Fonts: the sizes the screens use. Add more here if you change them. */',
    ...LVGL_FONT_SIZES.map((n) => `#define LV_FONT_MONTSERRAT_${n} 1`),
    '#define LV_FONT_DEFAULT &lv_font_montserrat_20',
    '',
    '/* Widgets the generated screens use */',
    '#define LV_USE_ARC 1',
    '#define LV_USE_BAR 1',
    '#define LV_USE_BTN 1',
    '#define LV_USE_IMG 1',
    '#define LV_USE_LABEL 1',
    '#define LV_USE_LINE 1',
    '#define LV_USE_CHART 1',
    '',
    '#endif /* LV_CONF_H */',
    '#endif /* enable this file */',
    '',
  ].join('\n');
}

/** The LVGL half of a sketch: everything between the shared value/screen logic and setup(). */
export function lvglParts(inp: LvglInput): LvglParts {
  const { spec, panel, W, H, screenIdx, touchSet, hasTouchUi, h } = inp;
  const { ident, fl, hex, condC, byteLines } = h;
  const notes: string[] = [t('LVGL draws with its own widgets and Montserrat fonts: the screens match the preview in layout, colours and behaviour, not pixel for pixel.')];
  const body: string[] = [];
  const init: string[] = [];
  const decl: string[] = [];
  const build: string[] = [];
  const update: string[] = [];
  const callbacks: string[] = [];
  const assets: string[] = [];
  const imgInit: string[] = [];
  let skippedPattern = false;
  let degree = false;
  let customFont = false;

  // Pictures (bitmaps and the built-in icons) as lv_img_dsc_t, set up at run time (no designated initialisers).
  const usedIcons = [...new Set(spec.screens.flatMap((s) => s.elements.flatMap((e) => (e.type === 'icon' ? [e.name] : []))))];
  for (const name of usedIcons) {
    const n = name.toUpperCase();
    assets.push(`static const uint8_t ICON_${n}[8] = {${ICON_BITS[name].map((b) => hex(b)).join(', ')}};`, `static lv_img_dsc_t DSC_ICON_${n};`);
    imgInit.push(`  DSC_ICON_${n}.header.cf = LV_IMG_CF_ALPHA_1BIT; DSC_ICON_${n}.header.always_zero = 0; DSC_ICON_${n}.header.w = 8; DSC_ICON_${n}.header.h = 8; DSC_ICON_${n}.data_size = 8; DSC_ICON_${n}.data = ICON_${n};`);
  }
  const usedBitmaps = (spec.bitmaps ?? []).filter((b) => spec.screens.some((s) => s.elements.some((e) => e.type === 'bitmap' && e.bitmap === b.id)));
  for (const bm of usedBitmaps) {
    const n = ident(bm.id);
    const bytes = dataOf(bm);
    if (bm.format === 'mono') {
      assets.push(`static const uint8_t BM_${n}[] = {  // ${bm.w}x${bm.h}, one bit per pixel, drawn in the element's colour`, ...byteLines(bytes), '};');
      imgInit.push(`  DSC_BM_${n}.header.cf = LV_IMG_CF_ALPHA_1BIT; DSC_BM_${n}.header.always_zero = 0; DSC_BM_${n}.header.w = ${bm.w}; DSC_BM_${n}.header.h = ${bm.h}; DSC_BM_${n}.data_size = ${bytes.length}; DSC_BM_${n}.data = BM_${n};`);
    } else {
      const words: number[] = [];
      for (let i = 0; i + 1 < bytes.length; i += 2) words.push((bytes[i] << 8) | bytes[i + 1]);
      assets.push(`static const uint16_t BM_${n}[] = {  // ${bm.w}x${bm.h}, RGB565`);
      for (let i = 0; i < words.length; i += 12) assets.push(`  ${words.slice(i, i + 12).map((w) => hex(w, 4)).join(', ')},`);
      assets.push('};');
      imgInit.push(`  DSC_BM_${n}.header.cf = LV_IMG_CF_TRUE_COLOR; DSC_BM_${n}.header.always_zero = 0; DSC_BM_${n}.header.w = ${bm.w}; DSC_BM_${n}.header.h = ${bm.h}; DSC_BM_${n}.data_size = ${bytes.length}; DSC_BM_${n}.data = (const uint8_t *)BM_${n};`);
    }
    assets.push(`static lv_img_dsc_t DSC_BM_${n};`);
  }

  // The actions of a button as C, run from its callback (ms is the time since start).
  const actionsC = (el: Extract<DisplayElement, { type: 'button' }>) =>
    el.actions.flatMap((a) => {
      if (a.do === 'screen') return screenIdx.has(a.screen) ? [`  screen = ${screenIdx.get(a.screen)}; enteredAt = ms;`] : [];
      if (!touchSet.has(a.var)) return [];
      const n = ident(a.var);
      return [a.do === 'set' ? `  t_${n} = ${fl(a.value)}; t_${n}_set = true; v_${n} = t_${n};` : `  t_${n} = (v_${n} != 0) ? 0 : 1; t_${n}_set = true; v_${n} = t_${n};`];
    });

  spec.screens.forEach((sc, si) => {
    decl.push(`static lv_obj_t *scr_${si};`);
    build.push(
      `  scr_${si} = lv_obj_create(NULL);  // ${sc.id}`,
      `  lv_obj_set_style_bg_color(scr_${si}, ${colorHex(sc.background)}, 0);`,
      `  lv_obj_set_style_bg_opa(scr_${si}, LV_OPA_COVER, 0);`,
      `  lv_obj_set_style_pad_all(scr_${si}, 0, 0);`,
      `  lv_obj_set_style_border_width(scr_${si}, 0, 0);`,
      `  lv_obj_clear_flag(scr_${si}, LV_OBJ_FLAG_SCROLLABLE);`,
    );
    const touchTr = spec.transitions.find((tr) => tr.touch && tr.from === sc.id && screenIdx.has(tr.to));
    if (touchTr) {
      callbacks.push(`static void on_tap_${si}(lv_event_t *e) {  // a tap on ${sc.id} that no button takes`, '  unsigned long ms = millis() - t0;', `  screen = ${screenIdx.get(touchTr.to)}; enteredAt = ms;`, '}');
      build.push(`  lv_obj_add_event_cb(scr_${si}, on_tap_${si}, LV_EVENT_CLICKED, NULL);`);
    }
    sc.elements.forEach((el, ei) => {
      const o = `o_${si}_${ei}`;
      const common = (clickable = false) => [
        ...(clickable ? [] : [`  lv_obj_clear_flag(${o}, LV_OBJ_FLAG_CLICKABLE);`]),
        `  lv_obj_clear_flag(${o}, LV_OBJ_FLAG_SCROLLABLE);`,
      ];
      const objStyle = (c: string, fill: string | null, border: number, radius: string) => [
        `  lv_obj_set_style_pad_all(${o}, 0, 0);`,
        `  lv_obj_set_style_radius(${o}, ${radius}, 0);`,
        `  lv_obj_set_style_border_width(${o}, ${border}, 0);`,
        `  lv_obj_set_style_border_color(${o}, ${colorHex(c)}, 0);`,
        `  lv_obj_set_style_shadow_width(${o}, 0, 0);`,
        ...(fill ? [`  lv_obj_set_style_bg_color(${o}, ${colorHex(fill)}, 0);`, `  lv_obj_set_style_bg_opa(${o}, LV_OPA_COVER, 0);`] : [`  lv_obj_set_style_bg_opa(${o}, LV_OPA_TRANSP, 0);`]),
      ];
      let made = true;
      switch (el.type) {
        case 'text': {
          if (el.font) customFont = true;
          if (el.text.includes('°')) degree = true;
          const size = Math.max(1, Math.min(8, Math.round(el.size)));
          const wd = el.align === 'center' ? 2 * Math.max(1, Math.min(el.x, W - el.x)) : el.align === 'right' ? Math.max(1, el.x) : Math.max(1, W - el.x);
          const x0 = el.align === 'center' ? el.x - Math.floor(wd / 2) : el.align === 'right' ? 0 : el.x;
          build.push(
            `  ${o} = lv_label_create(scr_${si});`,
            `  lv_obj_set_pos(${o}, ${x0}, ${el.y});`,
            `  lv_obj_set_width(${o}, ${wd});`,
            `  lv_obj_set_style_text_font(${o}, &lv_font_montserrat_${FONT_PX[size - 1]}, 0);`,
            `  lv_obj_set_style_text_color(${o}, ${colorHex(el.color)}, 0);`,
            `  lv_obj_set_style_text_align(${o}, ${el.align === 'center' ? 'LV_TEXT_ALIGN_CENTER' : el.align === 'right' ? 'LV_TEXT_ALIGN_RIGHT' : 'LV_TEXT_ALIGN_LEFT'}, 0);`,
            ...common(),
          );
          const names = [...el.text.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]);
          const vars = names.map((n) => spec.vars.find((v) => v.name === n)).filter((v): v is NonNullable<typeof v> => !!v);
          if (!vars.length) build.push(`  lv_label_set_text(${o}, ${lvStr(el.text)});`);
          else {
            const fmt = el.text.replace(/%/g, '%%').replace(/\{([A-Za-z_]\w*)\}/g, (all, n: string) => {
              const v = spec.vars.find((x) => x.name === n);
              return v ? `%.${Math.max(0, Math.min(3, v.digits))}f` : all;
            });
            update.push(`  { char b[96]; snprintf(b, sizeof(b), ${lvStr(fmt)}, ${vars.map((v) => `v_${ident(v.name)}`).join(', ')}); if (strcmp(lv_label_get_text(${o}), b) != 0) lv_label_set_text(${o}, b); }`);
          }
          break;
        }
        case 'rect':
          build.push(`  ${o} = lv_obj_create(scr_${si});`, `  lv_obj_set_pos(${o}, ${el.x}, ${el.y});`, `  lv_obj_set_size(${o}, ${el.w}, ${el.h});`, ...objStyle(el.color, el.fill ? el.color : null, el.fill ? 0 : 1, '0'), ...common());
          break;
        case 'circle':
          build.push(`  ${o} = lv_obj_create(scr_${si});`, `  lv_obj_set_pos(${o}, ${el.x - el.r}, ${el.y - el.r});`, `  lv_obj_set_size(${o}, ${2 * el.r + 1}, ${2 * el.r + 1});`, ...objStyle(el.color, el.fill ? el.color : null, el.fill ? 0 : 1, 'LV_RADIUS_CIRCLE'), ...common());
          break;
        case 'line':
          build.push(
            `  static lv_point_t pts_${si}_${ei}[2] = {{${el.x}, ${el.y}}, {${el.x2}, ${el.y2}}};`,
            `  ${o} = lv_line_create(scr_${si});`,
            `  lv_line_set_points(${o}, pts_${si}_${ei}, 2);`,
            `  lv_obj_set_style_line_color(${o}, ${colorHex(el.color)}, 0);`,
            `  lv_obj_set_style_line_width(${o}, 1, 0);`,
            ...common(),
          );
          break;
        case 'bar': {
          const k = scaleFor(el.min, el.max);
          const vertical = el.vertical || el.h > el.w;
          build.push(
            `  ${o} = lv_bar_create(scr_${si});`,
            `  lv_obj_set_pos(${o}, ${el.x}, ${el.y});`,
            `  lv_obj_set_size(${o}, ${vertical && el.w > el.h ? el.h : el.w}, ${vertical && el.w > el.h ? el.w : el.h});`,
            `  lv_bar_set_range(${o}, ${Math.round(el.min * k)}, ${Math.round(el.max * k)});`,
            ...objStyle(el.color, null, 1, '0'),
            `  lv_obj_set_style_bg_color(${o}, ${colorHex(el.color)}, LV_PART_INDICATOR);`,
            `  lv_obj_set_style_bg_opa(${o}, LV_OPA_COVER, LV_PART_INDICATOR);`,
            `  lv_obj_set_style_radius(${o}, 0, LV_PART_INDICATOR);`,
            ...common(),
          );
          update.push(`  lv_bar_set_value(${o}, (int)lround(v_${ident(el.value)} * ${k}), LV_ANIM_OFF);`);
          break;
        }
        case 'gauge': {
          const k = scaleFor(el.min, el.max);
          // The app counts degrees clockwise from 12 o'clock; LVGL from 3 o'clock.
          const a = (deg: number) => (((Math.round(deg) + 270) % 360) + 360) % 360;
          build.push(
            `  ${o} = lv_arc_create(scr_${si});`,
            `  lv_obj_set_pos(${o}, ${el.x - el.r}, ${el.y - el.r});`,
            `  lv_obj_set_size(${o}, ${2 * el.r}, ${2 * el.r});`,
            `  lv_arc_set_bg_angles(${o}, ${a(el.startDeg)}, ${a(el.endDeg)});`,
            `  lv_arc_set_range(${o}, ${Math.round(el.min * k)}, ${Math.round(el.max * k)});`,
            `  lv_obj_remove_style(${o}, NULL, LV_PART_KNOB);`,
            `  lv_obj_set_style_arc_width(${o}, ${Math.max(2, Math.round(el.r / 6))}, LV_PART_MAIN);`,
            `  lv_obj_set_style_arc_width(${o}, ${Math.max(2, Math.round(el.r / 6))}, LV_PART_INDICATOR);`,
            `  lv_obj_set_style_arc_color(${o}, ${colorHex(el.color)}, LV_PART_INDICATOR);`,
            `  lv_obj_set_style_arc_opa(${o}, LV_OPA_30, LV_PART_MAIN);`,
            `  lv_obj_set_style_arc_color(${o}, ${colorHex(el.color)}, LV_PART_MAIN);`,
            ...common(),
          );
          update.push(`  lv_arc_set_value(${o}, (int)lround(v_${ident(el.value)} * ${k}));`);
          break;
        }
        case 'graph': {
          const k = scaleFor(el.min, el.max);
          const n = Math.min(120, Math.max(2, el.w - 2));
          decl.push(`static lv_chart_series_t *ser_${si}_${ei};`);
          build.push(
            `  ${o} = lv_chart_create(scr_${si});`,
            `  lv_obj_set_pos(${o}, ${el.x}, ${el.y});`,
            `  lv_obj_set_size(${o}, ${el.w}, ${el.h});`,
            '  ' + `lv_chart_set_type(${o}, LV_CHART_TYPE_LINE);`,
            `  lv_chart_set_point_count(${o}, ${n});`,
            `  lv_chart_set_update_mode(${o}, LV_CHART_UPDATE_MODE_SHIFT);`,
            `  lv_chart_set_range(${o}, LV_CHART_AXIS_PRIMARY_Y, ${Math.round(el.min * k)}, ${Math.round(el.max * k)});`,
            `  lv_chart_set_div_line_count(${o}, 0, 0);`,
            `  lv_obj_set_style_size(${o}, 0, LV_PART_INDICATOR);`,
            ...objStyle(el.color, null, 1, '0'),
            `  ser_${si}_${ei} = lv_chart_add_series(${o}, ${colorHex(el.color)}, LV_CHART_AXIS_PRIMARY_Y);`,
            ...common(),
          );
          update.push(`  { static long last_${si}_${ei} = -1; long now = ms / ${GRAPH_STEP_MS}; if (now != last_${si}_${ei}) { last_${si}_${ei} = now; lv_chart_set_next_value(${o}, ser_${si}_${ei}, (lv_coord_t)lround(v_${ident(el.value)} * ${k})); } }`);
          break;
        }
        case 'icon': {
          const n = el.name.toUpperCase();
          build.push(`  ${o} = lv_img_create(scr_${si});`, `  lv_img_set_src(${o}, &DSC_ICON_${n});`, `  lv_obj_set_pos(${o}, ${el.x}, ${el.y});`, '  ' + `lv_img_set_pivot(${o}, 0, 0);`, `  lv_img_set_zoom(${o}, ${256 * Math.max(1, Math.round(el.scale))});`, `  lv_obj_set_style_img_recolor(${o}, ${colorHex(el.color)}, 0);`, `  lv_obj_set_style_img_recolor_opa(${o}, LV_OPA_COVER, 0);`, ...common());
          break;
        }
        case 'bitmap': {
          const bm = spec.bitmaps?.find((b) => b.id === el.bitmap);
          if (!bm) {
            made = false;
            break;
          }
          build.push(`  ${o} = lv_img_create(scr_${si});`, `  lv_img_set_src(${o}, &DSC_BM_${ident(bm.id)});`, `  lv_obj_set_pos(${o}, ${el.x}, ${el.y});`, `  lv_img_set_pivot(${o}, 0, 0);`, `  lv_img_set_zoom(${o}, ${256 * Math.max(1, Math.round(el.scale))});`);
          if (bm.format === 'mono') build.push(`  lv_obj_set_style_img_recolor(${o}, ${colorHex(el.color)}, 0);`, `  lv_obj_set_style_img_recolor_opa(${o}, LV_OPA_COVER, 0);`);
          build.push(...common());
          break;
        }
        case 'button': {
          if (el.hidden) build.push(`  ${o} = lv_obj_create(scr_${si});`, ...objStyle('#000000', null, 0, '0'));
          else build.push(`  ${o} = lv_btn_create(scr_${si});`, ...objStyle(el.color, el.fill.trim() || null, 1, '0'));
          build.push(`  lv_obj_set_pos(${o}, ${el.x}, ${el.y});`, `  lv_obj_set_size(${o}, ${el.w}, ${el.h});`, ...common(true));
          if (!el.hidden && el.label) {
            const size = Math.max(1, Math.min(8, Math.round(el.size)));
            build.push(`  { lv_obj_t *l = lv_label_create(${o}); lv_label_set_text(l, ${lvStr(el.label)}); lv_obj_set_style_text_font(l, &lv_font_montserrat_${FONT_PX[size - 1]}, 0); lv_obj_set_style_text_color(l, ${colorHex(el.color)}, 0); lv_obj_center(l); }`);
          }
          callbacks.push(`static void on_btn_${si}_${ei}(lv_event_t *e) {`, '  unsigned long ms = millis() - t0;', '  readValues(ms);', ...actionsC(el), '}');
          build.push(`  lv_obj_add_event_cb(${o}, on_btn_${si}_${ei}, LV_EVENT_CLICKED, NULL);`);
          break;
        }
        case 'pattern':
          skippedPattern = true;
          made = false;
          break;
      }
      if (!made) return;
      decl.push(`static lv_obj_t *${o};`);
      const guard: string[] = [];
      if (el.visibleIf.trim()) guard.push(condC(el.visibleIf));
      if (el.blinkMs > 0) guard.push(`((ms / ${el.blinkMs}UL) % 2 == 0)`);
      if (guard.length) update.push(`  if (${guard.join(' && ')}) lv_obj_clear_flag(${o}, LV_OBJ_FLAG_HIDDEN); else lv_obj_add_flag(${o}, LV_OBJ_FLAG_HIDDEN);`);
    });
  });

  if (skippedPattern) notes.push(t('Test patterns have no LVGL counterpart and are left out of this code.'));
  if (degree) notes.push(t('The ° sign is in LVGL’s Montserrat fonts only if they were built with it; if it shows as a box, use a font that has it.'));
  if (customFont) notes.push(t('Imported Adafruit GFX fonts are not used with LVGL (it has its own font format): the text uses Montserrat. LVGL’s font converter makes fonts for it.'));
  notes.push(t('Copy the generated lv_conf.h into Documents/Arduino/libraries next to the lvgl folder (replacing the one there), then build with LVGL 8.3.'));
  notes.push(t('BoardPilot cannot build LVGL code itself: build it once in the Arduino IDE and tell the assistant about any error it shows.'));

  body.push(
    '// LVGL display driver: LovyanGFX sends the pixels LVGL draws, in strips of 10 lines.',
    `static lv_disp_draw_buf_t draw_buf;`,
    `static lv_color_t lv_buf1[${W} * 10];`,
    `static lv_color_t lv_buf2[${W} * 10];`,
    'static lv_disp_drv_t disp_drv;',
    '',
    'static void my_disp_flush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *color_p) {',
    '  uint32_t w = area->x2 - area->x1 + 1, h = area->y2 - area->y1 + 1;',
    '  tft.startWrite();',
    '  tft.pushImage(area->x1, area->y1, w, h, (lgfx::rgb565_t *)&color_p->full);',
    '  tft.endWrite();',
    '  lv_disp_flush_ready(drv);',
    '}',
    '',
  );
  if (hasTouchUi)
    body.push(
      '// Touch → LVGL: the same bpTouchRead() as the other targets (calibrated to screen pixels).',
      'static lv_indev_drv_t indev_drv;',
      'static void my_touch_read(lv_indev_drv_t *drv, lv_indev_data_t *data) {',
      '  int x = 0, y = 0;',
      '  if (bpTouchRead(x, y)) { data->state = LV_INDEV_STATE_PR; data->point.x = x; data->point.y = y; }',
      '  else data->state = LV_INDEV_STATE_REL;',
      '}',
      '',
    );
  body.push(...assets, '', ...decl, 'static int shown = -1;  // the screen LVGL shows now', '', ...callbacks, '');
  body.push('static void build_ui() {', ...imgInit, ...build, '}', '');
  body.push(
    '// Every 33 ms: screen changes, values, and what shows when.',
    'static void update_ui(lv_timer_t *timer) {',
    '  unsigned long ms = millis() - t0;',
    '  changeScreens(ms);',
    '  readValues(ms);',
    '  if (screen != shown) {',
    '    shown = screen;',
    '    switch (screen) {',
    ...spec.screens.map((_, i) => `      case ${i}: lv_scr_load(scr_${i}); break;`),
    '    }',
    '  }',
    ...update,
    '}',
    '',
  );
  init.push(
    '  lv_init();',
    `  lv_disp_draw_buf_init(&draw_buf, lv_buf1, lv_buf2, ${W} * 10);`,
    '  lv_disp_drv_init(&disp_drv);',
    `  disp_drv.hor_res = ${W};`,
    `  disp_drv.ver_res = ${H};`,
    '  disp_drv.flush_cb = my_disp_flush;',
    '  disp_drv.draw_buf = &draw_buf;',
    '  lv_disp_drv_register(&disp_drv);',
    ...(hasTouchUi ? ['  lv_indev_drv_init(&indev_drv);', '  indev_drv.type = LV_INDEV_TYPE_POINTER;', '  indev_drv.read_cb = my_touch_read;', '  lv_indev_drv_register(&indev_drv);'] : []),
    '  build_ui();',
    '  lv_timer_create(update_ui, 33, NULL);',
  );
  void panel;
  return { body, init, notes };
}
