import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, onConfirm, onClose }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div id="confirm-modal" className={styles.modal}>
      <div
        id="confirm-backdrop"
        className={styles.backdrop}
        onClick={onClose}
      />
      <div id="confirm-box" className={styles.box}>
        <div className={styles.head}>全コメントを削除</div>
        <p className={styles.msg}>本当に消していいですか？</p>
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
            onClick={onConfirm}
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}
