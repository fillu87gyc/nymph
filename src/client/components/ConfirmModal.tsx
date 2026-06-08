import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div id="confirm-modal" className={styles.modal}>
      <div
        id="confirm-backdrop"
        className={styles.backdrop}
        onClick={onClose}
      />
      <div id="confirm-box" className={styles.box}>
        <div className={styles.head}>{title}</div>
        <p className={styles.msg}>{message}</p>
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
