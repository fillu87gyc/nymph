import { useState } from 'react';
import styles from './ConfirmModal.module.css';

export type DeleteMode = 'orphaned' | 'all';

interface ConfirmModalProps {
  orphanedCount: number;
  onConfirm: (mode: DeleteMode) => void;
  onClose: () => void;
}

/**
 * コメント削除の確認ダイアログ。
 *
 * 以前は open prop を Effect で見張って初期選択をやり直していたが、これは公式が
 * 挙げる「prop が変わったら state をリセットする」アンチパターン。開いている間
 * だけ呼び出し側がマウントするようにしたので、初期選択は useState の初期値で足りる。
 */
export function ConfirmModal({
  orphanedCount,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [mode, setMode] = useState<DeleteMode>(() =>
    orphanedCount > 0 ? 'orphaned' : 'all',
  );

  // 開いている最中に SSE などで削除済みコメントが 0 件になると「削除済みのみ削除」
  // が disabled になる。選択が無効な選択肢に残らないよう、ここで詰め直す。
  // Effect で追従させると 1 コミットぶん無効な選択が描画されてしまうため、
  // 公式の「レンダー中に state を調整する」に従ってレンダー中に直す。
  if (mode === 'orphaned' && orphanedCount === 0) {
    setMode('all');
  }

  function handleConfirm() {
    onConfirm(mode);
  }

  return (
    <div id="confirm-modal" className={styles.modal}>
      <div
        id="confirm-backdrop"
        className={styles.backdrop}
        onClick={onClose}
      />
      <div id="confirm-box" className={styles.box}>
        <div className={styles.head}>コメントを削除</div>
        <div className={styles.choices}>
          <label
            className={`${styles.choice} ${mode === 'orphaned' ? styles.choiceSelected : ''} ${orphanedCount === 0 ? styles.choiceDisabled : ''}`}
            data-testid="choice-orphaned"
          >
            <input
              type="radio"
              name="delete-mode"
              value="orphaned"
              checked={mode === 'orphaned'}
              disabled={orphanedCount === 0}
              onChange={() => setMode('orphaned')}
            />
            <span className={styles.choiceLabel}>削除済みのみ削除</span>
            <span className={styles.choiceDesc}>
              {orphanedCount > 0
                ? `元の文章が削除された ${orphanedCount} 件`
                : '削除済みコメントなし'}
            </span>
          </label>
          <label
            className={`${styles.choice} ${mode === 'all' ? styles.choiceSelected : ''}`}
            data-testid="choice-all"
          >
            <input
              type="radio"
              name="delete-mode"
              value="all"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
            />
            <span className={styles.choiceLabel}>すべて削除</span>
            <span className={styles.choiceDesc}>全コメントを削除</span>
          </label>
        </div>
        <div className={styles.foot}>
          <button
            type="button"
            className="btn"
            id="btn-confirm-cancel"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn danger"
            id="btn-confirm-ok"
            onClick={handleConfirm}
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}
