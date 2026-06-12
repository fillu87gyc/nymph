import { useEffect, useRef, useState } from 'react';
import styles from './OpenDirButton.module.css';

interface OpenDirButtonProps {
  onOpenDir: (path: string) => void;
}

export function OpenDirButton({ onOpenDir }: OpenDirButtonProps) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function close(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function submit() {
    const trimmed = path.trim();
    if (!trimmed) return;
    setOpen(false);
    setPath('');
    onOpenDir(trimmed);
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="btn"
        data-testid="open-dir-btn"
        title="ディレクトリを開いてツリー表示"
        onClick={() => setOpen((o) => !o)}
      >
        フォルダを開く
      </button>
      {open && (
        <div className={styles.popup}>
          <input
            ref={inputRef}
            className={styles.input}
            data-testid="open-dir-input"
            placeholder="ディレクトリのパス（例: /tmp/docs）"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <button
            type="button"
            className="btn primary"
            data-testid="open-dir-submit"
            onClick={submit}
          >
            開く
          </button>
        </div>
      )}
    </div>
  );
}
