interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, onConfirm, onClose }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div id="confirm-modal" className="open">
      <div id="confirm-backdrop" onClick={onClose} />
      <div id="confirm-box">
        <div className="modal-head">全コメントを削除</div>
        <p className="confirm-msg">本当に消していいですか？</p>
        <div className="modal-foot">
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
