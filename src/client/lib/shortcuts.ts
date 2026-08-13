/**
 * キーボードショートカットの定義と判定。
 *
 * 判定を純関数へ切り出しているのは、「IME 変換中は拾わない」「入力欄では拾わない」
 * のような条件が document の購読側に埋まると単体で確かめられなくなるため
 * （実際に壊れても画面を見ているかぎり気付けない類の条件）。
 *
 * 一覧モーダル（`ShortcutsModal`）が読むのも下の `SHORTCUT_SECTIONS` で、
 * `matchShortcut` が返しうるアクションが一覧に載っていることは単体テストで
 * 見張っている。実装と説明が黙ってずれないようにするための紐付け。
 */

export type ShortcutAction =
  | 'quick-open'
  | 'toggle-help'
  | 'toggle-comments'
  | 'toggle-theme';

/** KeyboardEvent のうち判定に使う部分だけ（テストから素のオブジェクトを渡せる）。 */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}

/**
 * 押されたキーに対応するショートカットを返す（無ければ null）。
 *
 * 修飾キー無しの 1 文字（`?` / `C` / `T`）は、Ctrl / Cmd との同時押しでは
 * 反応させない。Ctrl+T（新しいタブ）や Cmd+C（コピー）を奪わないため。
 */
export function matchShortcut(e: ShortcutKeyEvent): ShortcutAction | null {
  // 変換中のキーは入力の一部であってショートカットではない
  if (e.isComposing) return null;
  if (e.altKey) return null;

  if (e.ctrlKey || e.metaKey) {
    return e.key.toLowerCase() === 'p' ? 'quick-open' : null;
  }

  switch (e.key) {
    case '?':
      return 'toggle-help';
    case 'c':
    case 'C':
      return 'toggle-comments';
    case 't':
    case 'T':
      return 'toggle-theme';
    default:
      return null;
  }
}

/**
 * 文字入力を受け取る要素にフォーカスがあるか。
 * コメント本文や検索欄へ打った `c` が画面の操作に化けないよう、
 * 修飾キー無しのショートカットはここが true の間は止める。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false;
  const el = target as Partial<HTMLElement>;
  if (el.isContentEditable) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** 一覧に出す 1 項目。 */
export interface ShortcutEntry {
  /** 表示するキーキャップ。 */
  keys: string[];
  /** キーキャップのつなぎ方。'+' = 同時押し、'/' = どれか（既定は '+'）。 */
  join?: '+' | '/';
  desc: string;
  /**
   * `matchShortcut` が返すアクション。ここが埋まっている項目は
   * このファイルの判定で動く（Esc や矢印キーのように、開いている画面が
   * 各自で扱うものは持たない）。
   */
  action?: ShortcutAction;
}

export interface ShortcutSection {
  title: string;
  entries: ShortcutEntry[];
}

/**
 * `?` で出す一覧の中身。
 *
 * 「全体」以降は各画面が自前で扱うキー操作。判定こそ別だが、利用者から見れば
 * 同じキーボード操作なので 1 枚にまとめる（散らすと結局どこにも載らない）。
 */
export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  {
    title: '全体',
    entries: [
      {
        keys: ['?'],
        desc: 'このショートカット一覧を開く / 閉じる',
        action: 'toggle-help',
      },
      {
        keys: ['Ctrl / Cmd', 'P'],
        desc: 'Quick Open（ファイル名と本文の検索）',
        action: 'quick-open',
      },
      { keys: ['Esc'], desc: 'モーダル・メニュー・一覧を閉じる' },
    ],
  },
  {
    title: '表示',
    entries: [
      {
        keys: ['C'],
        desc: 'コメントパネルを開く / 閉じる（枠に置いているときは常時表示）',
        action: 'toggle-comments',
      },
      {
        keys: ['T'],
        desc: 'テーマ（ダーク / ライト）を切り替える',
        action: 'toggle-theme',
      },
    ],
  },
  {
    title: '幅の調整（境界を掴んでいるとき）',
    entries: [
      { keys: ['←', '→'], join: '/', desc: '幅を 16px ずつ変える' },
      { keys: ['Home'], desc: '既定の幅に戻す' },
    ],
  },
  {
    title: 'ウィジェット配置画面',
    entries: [
      { keys: ['←', '→'], join: '/', desc: '枠のあいだを移動する' },
      { keys: ['↑', '↓'], join: '/', desc: '枠の中で並べ替える' },
    ],
  },
  {
    title: '図の拡大表示',
    entries: [{ keys: ['Ctrl', 'スクロール'], desc: '拡大 / 縮小' }],
  },
];
