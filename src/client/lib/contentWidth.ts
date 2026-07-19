/** 本文（#content）の左右マージン折りたたみ状態から最大幅を決める。 */
export interface MarginCollapse {
  left: boolean;
  right: boolean;
}

const DEFAULT_MAX = '960px';
const SINGLE_COLLAPSED_MAX = '1280px';
const BOTH_COLLAPSED_MAX = '1600px';

export function contentMaxWidth({ left, right }: MarginCollapse): string {
  if (left && right) return BOTH_COLLAPSED_MAX;
  if (left || right) return SINGLE_COLLAPSED_MAX;
  return DEFAULT_MAX;
}

const STORAGE_KEY_LEFT = 'nymph-margin-left-collapsed';
const STORAGE_KEY_RIGHT = 'nymph-margin-right-collapsed';

export function loadMarginCollapse(): MarginCollapse {
  return {
    left: localStorage.getItem(STORAGE_KEY_LEFT) === '1',
    right: localStorage.getItem(STORAGE_KEY_RIGHT) === '1',
  };
}

export function saveMarginCollapse(state: MarginCollapse): void {
  localStorage.setItem(STORAGE_KEY_LEFT, state.left ? '1' : '0');
  localStorage.setItem(STORAGE_KEY_RIGHT, state.right ? '1' : '0');
}
