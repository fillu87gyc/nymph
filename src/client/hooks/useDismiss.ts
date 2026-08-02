import { useEffect, useRef } from 'react';

/**
 * メニュー・ポップオーバーを閉じるための document 購読。
 *
 * document への購読は「外部システムとの同期」なので Effect が正しい使い道で、
 * React 公式「You Might Not Need an Effect」が挙げるアンチパターンには当たらない。
 * ただし同じ購読が 6 箇所に重複していたため、ここへ集約する
 * （公式「Reusing Logic with Custom Hooks」の推奨どおり Effect をフックで包む）。
 *
 * コールバックは ref で受け直しているので、呼び出し側がインライン関数を渡しても
 * レンダーのたびに購読し直さない。
 */

/** レンダーごとに識別子が変わるコールバックを、購読の依存から外すための箱。 */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface OutsideDismissOptions {
  /** false の間は購読しない（閉じているメニューが document を掴み続けないように）。 */
  enabled?: boolean;
  /** true を返した mousedown は無視する（下書き保護や、開閉トグル側への委譲）。 */
  ignore?: (target: HTMLElement | null) => boolean;
}

/** `ref` の外側の mousedown で `onDismiss` を呼ぶ。 */
export function useOutsideDismiss(
  ref: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
  { enabled = true, ignore }: OutsideDismissOptions = {},
) {
  const onDismissRef = useLatest(onDismiss);
  const ignoreRef = useLatest(ignore);

  useEffect(() => {
    if (!enabled) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ref.current?.contains(target)) return;
      if (ignoreRef.current?.(target)) return;
      onDismissRef.current();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [enabled, ref, onDismissRef, ignoreRef]);
}

/** Escape キーで `onDismiss` を呼ぶ。 */
export function useEscapeDismiss(onDismiss: () => void, enabled = true) {
  const onDismissRef = useLatest(onDismiss);

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismissRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, onDismissRef]);
}
