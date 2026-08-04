/**
 * ウィジェット配置のモデル。
 *
 * 画面左右の折りたたみ可能なスロットに、どのパネル（ウィジェット）を積むかを
 * ユーザーが決められるようにする。VSCode のサイドバーと同じ発想で、1 つの
 * スロットに複数のウィジェットを縦に積める。
 *
 * 「スロットに入っていない」＝そのウィジェット本来の既定位置（タブなら
 * ツールバー直下の横行、コメントなら画面下のドック）に出す、という意味。
 * エクスプローラーとアウトラインは既定位置を持たないスロット専用ウィジェット
 * なので、必ずどちらかのスロットに属する（`slotOnly`）。
 *
 * 配置は他の表示設定（テーマ・フォント・本文幅）と同じく localStorage に
 * 保存する。ウィジェットを出すかどうか（＝表示トグル）は配置とは別軸で、
 * 従来どおり各ウィジェット側の条件（タブは2ファイル以上、エクスプローラーは
 * ルートあり、アウトラインは開閉トグル、コメントはパネル開閉）で決まる。
 */

export const WIDGET_IDS = ['tabs', 'explorer', 'outline', 'comments'] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

/** ウィジェットを置ける枠。今は左右のみ。 */
export type SlotId = 'left' | 'right';

/** 配置先。null はスロット外＝そのウィジェットの既定位置。 */
export type WidgetPlacement = SlotId | null;

export interface WidgetLayout {
  /** 左スロットに積む順（先頭が上）。 */
  left: WidgetId[];
  /** 右スロットに積む順（先頭が上）。 */
  right: WidgetId[];
}

interface WidgetMeta {
  /** 設定 UI とスロットのヘッダーに出す名前。 */
  label: string;
  /** 既定位置を持たず、必ずどちらかのスロットに置かれるか。 */
  slotOnly: boolean;
  /** 既定位置の呼び名（設定 UI の選択肢ラベル）。slotOnly なら null。 */
  defaultLabel: string | null;
  /** スロット内で余った縦幅を分け合うか。false なら内容ぶんの高さで収まる。 */
  grows: boolean;
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  tabs: {
    label: 'タブ',
    slotOnly: false,
    defaultLabel: '横行',
    // 開いているファイル数ぶんの高さで足りる。伸ばすと他が潰れて損。
    grows: false,
  },
  explorer: {
    label: 'エクスプローラー',
    slotOnly: true,
    defaultLabel: null,
    grows: true,
  },
  outline: {
    label: 'アウトライン',
    slotOnly: true,
    defaultLabel: null,
    grows: true,
  },
  comments: {
    label: 'コメント',
    slotOnly: false,
    defaultLabel: '下ドック',
    grows: true,
  },
};

/** スロット専用ウィジェットが最初に入るスロット。 */
const DEFAULT_SLOT: Record<WidgetId, SlotId> = {
  tabs: 'left',
  explorer: 'left',
  outline: 'right',
  comments: 'right',
};

/** 従来の見た目（左＝エクスプローラー / 右＝アウトライン）と同じ既定配置。 */
export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  left: ['explorer'],
  right: ['outline'],
};

export const WIDGET_LAYOUT_STORAGE_KEY = 'nymph-widget-layout';

const SLOT_IDS: SlotId[] = ['left', 'right'];

function isWidgetId(value: unknown): value is WidgetId {
  return (
    typeof value === 'string' &&
    (WIDGET_IDS as readonly string[]).includes(value)
  );
}

/** そのウィジェットが今どのスロットにいるか。null なら既定位置。 */
export function widgetPlacement(
  layout: WidgetLayout,
  id: WidgetId,
): WidgetPlacement {
  for (const slot of SLOT_IDS) {
    if (layout[slot].includes(id)) return slot;
  }
  return null;
}

/**
 * ウィジェットの配置を変える。元のスロットからは必ず外れるので、同じ
 * ウィジェットが 2 箇所に出ることはない。引数の layout は破壊しない。
 *
 * スロット専用ウィジェット（エクスプローラー・アウトライン）を既定位置
 * （null）へ動かそうとした場合は、行き先が無いので配置を変えない。
 */
export function placeWidget(
  layout: WidgetLayout,
  id: WidgetId,
  placement: WidgetPlacement,
): WidgetLayout {
  if (placement === null && WIDGET_META[id].slotOnly) {
    return { left: [...layout.left], right: [...layout.right] };
  }
  const next: WidgetLayout = {
    left: layout.left.filter((w) => w !== id),
    right: layout.right.filter((w) => w !== id),
  };
  if (placement !== null) next[placement].push(id);
  return next;
}

/**
 * 保存済み・外部由来の値を安全な WidgetLayout に整える。
 *
 * - 未知の id は捨てる（将来ウィジェットを削っても壊れないように）
 * - 重複は 1 つに畳む（両スロットに現れたら左を優先）
 * - スロット専用ウィジェットが欠けていれば既定のスロットの末尾へ補う
 */
export function normalizeWidgetLayout(raw: unknown): WidgetLayout {
  if (typeof raw !== 'object' || raw === null) return cloneDefault();

  const source = raw as Partial<Record<SlotId, unknown>>;
  const seen = new Set<WidgetId>();
  const out: WidgetLayout = { left: [], right: [] };

  for (const slot of SLOT_IDS) {
    const value = source[slot];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!isWidgetId(entry) || seen.has(entry)) continue;
      seen.add(entry);
      out[slot].push(entry);
    }
  }

  for (const id of WIDGET_IDS) {
    if (WIDGET_META[id].slotOnly && !seen.has(id))
      out[DEFAULT_SLOT[id]].push(id);
  }

  return out;
}

function cloneDefault(): WidgetLayout {
  return {
    left: [...DEFAULT_WIDGET_LAYOUT.left],
    right: [...DEFAULT_WIDGET_LAYOUT.right],
  };
}

export function loadWidgetLayout(): WidgetLayout {
  try {
    const saved = localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY);
    if (!saved) return cloneDefault();
    return normalizeWidgetLayout(JSON.parse(saved));
  } catch {
    // 壊れた JSON / localStorage 不可の環境では既定に落とす
    return cloneDefault();
  }
}

export function saveWidgetLayout(layout: WidgetLayout): void {
  try {
    localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 保存できなくても配置自体は動くので握りつぶす
  }
}
