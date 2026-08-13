import { describe, expect, test } from 'vitest';
import {
  isTypingTarget,
  matchShortcut,
  SHORTCUT_SECTIONS,
  type ShortcutAction,
  type ShortcutKeyEvent,
} from '../../src/client/lib/shortcuts.ts';

function ev(over: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key: 'a',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...over,
  };
}

describe('matchShortcut', () => {
  test('Ctrl / Cmd + P は Quick Open', () => {
    expect(matchShortcut(ev({ key: 'p', ctrlKey: true }))).toBe('quick-open');
    expect(matchShortcut(ev({ key: 'p', metaKey: true }))).toBe('quick-open');
    // CapsLock やレイアウト差で大文字が来ることがある
    expect(matchShortcut(ev({ key: 'P', ctrlKey: true }))).toBe('quick-open');
  });

  test('修飾キー無しの 1 文字を拾う', () => {
    expect(matchShortcut(ev({ key: '?' }))).toBe('toggle-help');
    expect(matchShortcut(ev({ key: 'c' }))).toBe('toggle-comments');
    expect(matchShortcut(ev({ key: 'C' }))).toBe('toggle-comments');
    expect(matchShortcut(ev({ key: 't' }))).toBe('toggle-theme');
    expect(matchShortcut(ev({ key: 'T' }))).toBe('toggle-theme');
  });

  test('割り当てのないキーは null', () => {
    expect(matchShortcut(ev({ key: 'x' }))).toBeNull();
    expect(matchShortcut(ev({ key: 'Escape' }))).toBeNull();
    expect(matchShortcut(ev({ key: 'ArrowLeft' }))).toBeNull();
  });

  test('1 文字ショートカットは Ctrl / Cmd と同時押しでは反応しない', () => {
    // Ctrl+T（新しいタブ）・Cmd+C（コピー）などブラウザ / OS の操作を奪わない
    expect(matchShortcut(ev({ key: 't', ctrlKey: true }))).toBeNull();
    expect(matchShortcut(ev({ key: 'c', metaKey: true }))).toBeNull();
  });

  test('Alt との同時押しは拾わない', () => {
    expect(matchShortcut(ev({ key: 't', altKey: true }))).toBeNull();
    expect(
      matchShortcut(ev({ key: 'p', ctrlKey: true, altKey: true })),
    ).toBeNull();
  });

  test('IME 変換中は拾わない', () => {
    // 日本語入力の変換確定に使われるキーをショートカットとして横取りしない
    expect(matchShortcut(ev({ key: 'c', isComposing: true }))).toBeNull();
    expect(
      matchShortcut(ev({ key: 'p', ctrlKey: true, isComposing: true })),
    ).toBeNull();
  });
});

describe('isTypingTarget', () => {
  test('入力欄は true', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  test('contenteditable は true', () => {
    const el = document.createElement('div');
    // jsdom は isContentEditable を実装していないため直接生やす
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isTypingTarget(el)).toBe(true);
  });

  test('本文やボタンは false', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('SHORTCUT_SECTIONS', () => {
  const entries = SHORTCUT_SECTIONS.flatMap((s) => s.entries);

  test('すべての節と項目に表示内容がある', () => {
    expect(SHORTCUT_SECTIONS.length).toBeGreaterThan(0);
    for (const section of SHORTCUT_SECTIONS) {
      expect(section.title).not.toBe('');
      expect(section.entries.length).toBeGreaterThan(0);
      for (const entry of section.entries) {
        expect(entry.keys.length).toBeGreaterThan(0);
        expect(entry.desc).not.toBe('');
      }
    }
  });

  // 一覧は「読むためのドキュメント」なので、実装と手で二重管理すると必ずずれる。
  // matchShortcut が返しうるアクションが漏れなく 1 度だけ載っていることを見張る。
  test('matchShortcut のアクションが漏れなく 1 度だけ載っている', () => {
    const actions: ShortcutAction[] = [
      'quick-open',
      'toggle-help',
      'toggle-comments',
      'toggle-theme',
    ];
    const listed = entries.map((e) => e.action).filter((a) => a !== undefined);
    expect([...listed].sort()).toEqual([...actions].sort());
  });
});
