// The Code panel's CodeMirror base: C/C++ highlighting in the design tokens' colours, line
// numbers, folding, bracket matching and auto-close, undo history, find and replace, go to line,
// comment toggling (⌘/), and CodeMirror's own words translated through t().

import { Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, lineNumbers, rectangularSelection } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { history } from '@codemirror/commands';
import { HighlightStyle, bracketMatching, foldGutter, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search } from '@codemirror/search';
import { closeBrackets } from '@codemirror/autocomplete';
import { lintGutter } from '@codemirror/lint';
import { cpp } from '@codemirror/lang-cpp';
import { tags } from '@lezer/highlight';
import { t } from '@shared/i18n';
import { isSourceFile } from '@shared/codeProject';

/** Colours of the old highlighter (workspace.css .tk-*), so code looks the same everywhere. */
const highlight = HighlightStyle.define([
  { tag: [tags.lineComment, tags.blockComment], color: '#6f7c8a', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string), tags.character], color: '#e8b86a' },
  { tag: [tags.processingInstruction, tags.meta], color: '#e07bd4' },
  { tag: [tags.definitionKeyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword, tags.self, tags.bool, tags.null], color: '#c9beff' },
  { tag: [tags.standard(tags.typeName), tags.typeName, tags.namespace], color: '#9adcf7' },
  { tag: tags.number, color: '#e8d24a' },
  { tag: tags.special(tags.name), color: '#ff9f8f' },
  { tag: [tags.function(tags.definition(tags.variableName))], color: '#e9edf1', fontWeight: '600' },
  { tag: tags.escape, color: '#ff9f8f' },
  { tag: tags.invalid, color: 'var(--err)' },
]);

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--viewport)', color: 'var(--text)', fontSize: '12.5px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '19px' },
    '.cm-content': { caretColor: 'var(--text)', padding: '8px 0' },
    '.cm-cursor': { borderLeftColor: 'var(--text)' },
    '.cm-gutters': { backgroundColor: 'var(--chrome)', color: 'var(--dim)', borderRight: '1px solid var(--line)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.025)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(201, 190, 255, 0.22)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(201, 190, 255, 0.1)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(92, 203, 143, 0.22)', outline: '1px solid rgba(92, 203, 143, 0.5)' },
    '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'rgba(255, 93, 82, 0.25)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--raised)', border: 'none', color: 'var(--muted)', padding: '0 6px' },
    '.cm-tooltip': { backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--text)', fontFamily: 'var(--font-ui)' },
    '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', maxHeight: '16em' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--ai-bg)', color: 'var(--text)' },
    '.cm-completionDetail': { color: 'var(--dim)', fontStyle: 'normal', marginLeft: '10px', fontFamily: 'var(--font-ui)', fontSize: '11.5px' },
    '.cm-completionInfo': { maxWidth: '320px', whiteSpace: 'pre-line', fontSize: '12px', lineHeight: '1.45', padding: '8px 10px' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--ai)' },
    '.cm-panels': { backgroundColor: 'var(--chrome)', color: 'var(--text)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
    '.cm-search': { fontFamily: 'var(--font-ui)', fontSize: '12px', padding: '6px 10px' },
    '.cm-search label': { color: 'var(--muted)' },
    '.cm-textfield': { backgroundColor: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '5px', color: 'var(--text)', padding: '3px 6px', fontFamily: 'var(--font-mono)' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--raised)', border: '1px solid var(--line)', borderRadius: '5px', color: 'var(--text)', padding: '2px 8px' },
    '.cm-searchMatch': { backgroundColor: 'rgba(242, 169, 59, 0.25)', outline: '1px solid rgba(242, 169, 59, 0.5)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(242, 169, 59, 0.5)' },
    '.cm-diagnostic': { padding: '6px 10px', borderLeftWidth: '3px', fontSize: '12px', lineHeight: '1.45', whiteSpace: 'pre-line', maxWidth: '520px' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--err)' },
    '.cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
    '.cm-diagnostic-info': { borderLeftColor: 'var(--pin-sda)' },
    '.cm-diagnosticText': { display: 'block' },
    '.cm-diagnosticSource': { color: 'var(--dim)', fontFamily: 'var(--font-mono)', fontSize: '11px' },
    '.cm-diagnosticAction': { backgroundColor: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '5px', padding: '1px 8px', marginLeft: '0', marginRight: '6px', marginTop: '6px', fontSize: '11.5px' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--err)', textUnderlineOffset: '3px' },
    '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--warn)', textUnderlineOffset: '3px' },
    '.cm-lintRange-info': { backgroundImage: 'none', textDecoration: 'underline dotted var(--pin-sda)', textUnderlineOffset: '3px' },
    '.cm-lint-marker': { width: '0.8em', height: '0.8em' },
    '.cm-gutter-lint': { width: '1.1em' },
  },
  { dark: true },
);

/** Arduino and ESP32 core calls a beginner meets first, in the API colour (as the old highlighter did). */
const API_CALLS =
  /\b(setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|analogReadMilliVolts|analogReadResolution|delay|delayMicroseconds|millis|micros|attachInterrupt|detachInterrupt|digitalPinToInterrupt|tone|noTone|map|constrain|random|pulseIn|ledcAttach|ledcAttachPin|ledcWrite|ledcSetup|touchRead|dacWrite|shiftOut|shiftIn)\b(?=\s*\()/g;
const apiMatcher = new MatchDecorator({ regexp: API_CALLS, decoration: Decoration.mark({ class: 'tk-api' }) });
const arduinoApi = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = apiMatcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = apiMatcher.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

/** CodeMirror's own words (search panel, go to line, folding, lint), in the app's language. */
export function phrases(): Extension {
  return EditorState.phrases.of({
    Find: t('Find'),
    Replace: t('Replace'),
    next: t('next'),
    previous: t('previous'),
    all: t('all'),
    'match case': t('match case'),
    'by word': t('by word'),
    regexp: t('regexp'),
    replace: t('replace'),
    'replace all': t('replace all'),
    close: t('close'),
    'current match': t('current match'),
    'on line': t('on line'),
    'Go to line': t('Go to line'),
    go: t('go'),
    'Fold line': t('Fold line'),
    'Unfold line': t('Unfold line'),
    'folded code': t('folded code'),
    unfold: t('unfold'),
    Diagnostics: t('Problems'),
    'No diagnostics': t('No problems'),
    Completions: t('Completions'),
  });
}

/** The language support for a file: C/C++ for sources, plain text for the rest (CMakeLists, README). */
export const languageFor = (name: string): Extension => (isSourceFile(name) ? cpp() : []);

/** Everything but the BoardPilot features and the keymap (see CodeEditor). */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter({ openText: '▾', closedText: '▸' }),
    lintGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    syntaxHighlighting(highlight),
    arduinoApi,
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    theme,
  ];
}
