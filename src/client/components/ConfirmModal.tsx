import { useEffect, useState } from 'react';
import styles from './ConfirmModal.module.css';

export type DeleteMode = 'orphaned' | 'all';

interface ConfirmModalProps {
  open: boolean;
  orphanedCount: number;
  onConfirm: (mode: DeleteMode) => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  orphanedCount,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [mode, setMode] = useState<DeleteMode>(() =>
    orphanedCount > 0 ? 'orphaned' : 'all',
  );

  useEffect(() => {
    if (open) setMode(orphanedCount > 0 ? 'orphaned' : 'all');
  }, [open, orphanedCount]);

  if (!open) return null;

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
