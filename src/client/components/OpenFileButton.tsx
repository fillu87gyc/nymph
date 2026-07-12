interface OpenFileButtonProps {
  onPickFile: () => void;
}

export function OpenFileButton({ onPickFile }: OpenFileButtonProps) {
  return (
    <button
      type="button"
      className="btn"
      data-testid="open-file-btn"
      title="OSのダイアログでMarkdownファイルを選んで開く"
      onClick={onPickFile}
    >
      ファイルを開く
    </button>
  );
}
