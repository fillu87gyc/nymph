/**
 * ウィジェット配置のモデル。
 *
 * 画面左右の折りたたみ可能なスロットに、どのパネル（ウィジェット）を積むかを
 * ユーザーが決められるようにする。VSCode のサイドバーと同じ発想で、1 つの
 * スロットに複数のウィジェットを縦に積める。
 *
 * ウィジェットは「既定位置を持つか」「枠から出せるか」の 2 軸で 3 種類ある。
 *
 * - 既定位置を持つ（`defaultLabel` あり）: タブ（ツールバー直下の横行）と
 *   コメント（画面下のドック）。枠に入れなければ本来の位置に出る。
 * - 枠から出せない（`required`）: エクスプローラーとアウトライン。既定位置を
 *   持たないので、正規化時に欠けていれば既定スロットへ補完する。
 * - どちらでもない（第2弾で足したもの）: 既定位置を持たず、枠に置いたときだけ
 *   出る。枠から出す＝画面から消す、という意味になる。
 *
 * 配置は他の表示設定（テーマ・フォント・本文幅）と同じく localStorage に
 * 保存する。ウィジェットを出すかどうか（＝表示トグル）は配置とは別軸で、
 * 従来どおり各ウィジェット側の条件（タブは2ファイル以上、エクスプローラーは
 * ルートあり、アウトラインは開閉トグル、コメントはパネル開閉）で決まる。
 */

export const WIDGET_IDS = [
  // 第1弾（既存パネルの移設）
  'tabs',
  'explorer',
  'outline',
  'comments',
  // 第2弾（枠に置いたときだけ出るウィジェット）
  'search',
  'recent',
  'minimap',
  'diagrams',
  'tasks',
  'links',
  'terms',
  'frontmatter',
  'diffsummary',
  'stats',
] as const;

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
  /**
   * 既定位置の呼び名（配置画面の注記）。null なら既定位置を持たず、
   * 枠に置いたときだけ画面に出る。
   */
  defaultLabel: string | null;
  /**
   * 枠から出せないか。true のものは既定位置も持たないため、正規化時に
   * どちらの枠にも居なければ既定スロットへ補完する。
   */
  required: boolean;
  /** スロット内で余った縦幅を分け合うか。false なら内容ぶんの高さで収まる。 */
  grows: boolean;
  /** 配置画面で「何が出るのか」を一言で説明する。 */
  hint: string;
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  tabs: {
    label: 'タブ',
    defaultLabel: '横行',
    required: false,
    // 開いているファイル数ぶんの高さで足りる。伸ばすと他が潰れて損。
    grows: false,
    hint: '開いているファイルの一覧',
  },
  explorer: {
    label: 'エクスプローラー',
    defaultLabel: null,
    required: true,
    grows: true,
    hint: 'ルートディレクトリのファイルツリー',
  },
  outline: {
    label: 'アウトライン',
    defaultLabel: null,
    required: true,
    grows: true,
    hint: '見出しの一覧',
  },
  comments: {
    label: 'コメント',
    defaultLabel: '下ドック',
    required: false,
    grows: true,
    hint: 'レビューコメントの一覧',
  },
  search: {
    label: '検索結果',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: '本文の全文検索を常設パネルで',
  },
  recent: {
    label: '最近 / ブックマーク',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: '最近開いたファイルとブックマーク',
  },
  minimap: {
    label: 'ミニマップ',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: '文書全体の俯瞰とコメント位置',
  },
  diagrams: {
    label: '図の一覧',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: '本文中の Mermaid 図へジャンプ',
  },
  tasks: {
    label: 'タスク',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: 'チェックボックス（- [ ]）の一覧',
  },
  links: {
    label: 'リンク / 画像',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: 'リンクと画像の一覧（相対パスは生死も判定）',
  },
  terms: {
    label: '用語集',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: '辞書の用語一覧と本文中の出現箇所',
  },
  frontmatter: {
    label: 'frontmatter',
    defaultLabel: null,
    required: false,
    // 数行のメタ情報なので内容ぶんの高さで足りる。
    grows: false,
    hint: '先頭の YAML メタ情報',
  },
  diffsummary: {
    label: '差分サマリ',
    defaultLabel: null,
    required: false,
    grows: true,
    hint: 'チェックポイントからの変更箇所',
  },
  stats: {
    label: '文書統計',
    defaultLabel: null,
    required: false,
    grows: false,
    hint: '文字数・見出し数・推定読了時間',
  },
};

/** 枠から出せないウィジェットが、配置に無いときへ補われるスロット。 */
const DEFAULT_SLOT: Partial<Record<WidgetId, SlotId>> = {
  explorer: 'left',
  outline: 'right',
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

/** そのウィジェットが今どのスロットにいるか。null なら枠の外。 */
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
 * ウィジェットを配置先の指定した位置へ移す。元のスロットからは必ず外れるので、
 * 同じウィジェットが 2 箇所に出ることはない。引数の layout は破壊しない。
 *
 * `index` は「そのウィジェットを抜いたあとの配置先の配列」での挿入位置。
 * 同じスロット内の並べ替え（下から上・上から下）も、別のスロットへの移動も
 * この 1 つの規則で説明できる。範囲外の値は端に丸める。
 *
 * 枠から出せないウィジェット（エクスプローラー・アウトライン）を枠の外
 * （null）へ動かそうとした場合は、行き先が無いので配置を変えない。
 */
export function moveWidget(
  layout: WidgetLayout,
  id: WidgetId,
  placement: WidgetPlacement,
  index: number,
): WidgetLayout {
  if (placement === null && WIDGET_META[id].required) {
    return { left: [...layout.left], right: [...layout.right] };
  }
  const next: WidgetLayout = {
    left: layout.left.filter((w) => w !== id),
    right: layout.right.filter((w) => w !== id),
  };
  if (placement !== null) {
    const list = next[placement];
    const at = Number.isNaN(index)
      ? list.length
      : Math.max(0, Math.min(Math.trunc(index), list.length));
    list.splice(at, 0, id);
  }
  return next;
}

/**
 * ウィジェットを配置先の末尾へ移す（`moveWidget` の index 省略版）。
 * 枠の外へ戻すときは末尾もなにも無いので単に枠から外れる。
 */
export function placeWidget(
  layout: WidgetLayout,
  id: WidgetId,
  placement: WidgetPlacement,
): WidgetLayout {
  return moveWidget(layout, id, placement, Number.POSITIVE_INFINITY);
}

/**
 * 今どちらの枠にも入っていないウィジェット。配置画面の「利用可能」一覧は
 * これを並べる。枠から出せないものは（正規化前の壊れた配置であっても）
 * 行き先が無いのでここには出さない。
 */
export function availableWidgets(layout: WidgetLayout): WidgetId[] {
  return WIDGET_IDS.filter(
    (id) => !WIDGET_META[id].required && widgetPlacement(layout, id) === null,
  );
}

/**
 * 保存済み・外部由来の値を安全な WidgetLayout に整える。
 *
 * - 未知の id は捨てる（将来ウィジェットを削っても壊れないように）
 * - 重複は 1 つに畳む（両スロットに現れたら左を優先）
 * - 枠から出せないウィジェットが欠けていれば既定のスロットの末尾へ補う
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
    if (WIDGET_META[id].required && !seen.has(id))
      out[DEFAULT_SLOT[id] ?? 'left'].push(id);
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
