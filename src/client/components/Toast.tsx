import styles from './Toast.module.css';

/** 自動で消えるまでの時間（ms）。消すタイミングは呼び出し側（App）が持つ。 */
export const TOAST_DURATION_MS = 2400;

interface ToastProps {
  message: string;
}

/**
 * 一定時間で自動的に消える通知の見た目だけを持つコンポーネント。
 *
 * 以前は message を Effect で state へ写し取り、自前のタイマーで消していた。
 * これは公式が挙げる「props から state を導出するために Effect を使う」
 * アンチパターンで、props 更新 → 描画 → Effect → 再描画と 1 往復ぶん無駄が出る。
 * 表示するかどうか（＝いつ消えるか）は通知を出した側が知っているので、
 * その判断は App に寄せ、ここは state も Effect も持たない純粋な表示に徹する。
 */
export function Toast({ message }: ToastProps) {
  return (
    <div id="toast" className={styles.toast}>
      {message}
    </div>
  );
}
