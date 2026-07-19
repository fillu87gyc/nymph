interface OpenDirButtonProps {
  onPickDir: () => void;
}

export function OpenDirButton({ onPickDir }: OpenDirButtonProps) {
  return (
    <button
      type="button"
      className="btn"
      data-testid="open-dir-btn"
      title="OSのダイアログでディレクトリを選んでツリー表示"
      onClick={onPickDir}
    >
      フォルダを開く
    </button>
  );
}
