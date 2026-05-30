import { useState, useCallback } from 'react';
import type { FileEntry } from '../types.ts';

export function useFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/files');
      const data: FileEntry[] = await res.json();
      setFiles(data);
      if (data.length > 0) {
        setActiveFile(prev => prev ?? data[0].path);
      }
      return data;
    } catch {
      return [];
    }
  }, []);

  const switchFile = useCallback(async (path: string) => {
    await fetch('/active-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    setActiveFile(path);
  }, []);

  return { files, activeFile, setActiveFile, loadFiles, switchFile };
}
