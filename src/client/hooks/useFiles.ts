import { useCallback, useState } from 'react';
import type { FileEntry } from '../types.ts';

export function useFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/files');
      const data: { files: FileEntry[]; activeFile: string | null } =
        await res.json();
      setFiles(data.files);
      if (data.files.length > 0) {
        setActiveFile(data.activeFile ?? data.files[0].path);
      }
      return data.files;
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

  const closeFile = useCallback(async (path: string) => {
    const res = await fetch('/close-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    setFiles(data.files);
    setActiveFile(data.activeFile);
    return data.activeFile as string | null;
  }, []);

  return { files, activeFile, setActiveFile, loadFiles, switchFile, closeFile };
}
