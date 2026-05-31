import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useFiles } from '../../src/client/hooks/useFiles.ts';
import type { FileEntry } from '../../src/client/types.ts';

const mockFiles: FileEntry[] = [
  { path: '/docs/a.md', name: 'a.md' },
  { path: '/docs/b.md', name: 'b.md' },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ files: mockFiles, activeFile: mockFiles[0].path }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFiles', () => {
  test('初期状態: files=[]・activeFile=null', () => {
    const { result } = renderHook(() => useFiles());
    expect(result.current.files).toEqual([]);
    expect(result.current.activeFile).toBeNull();
  });

  test('loadFiles でファイル一覧を取得する', async () => {
    const { result } = renderHook(() => useFiles());
    await act(() => result.current.loadFiles());
    expect(result.current.files).toEqual(mockFiles);
  });

  test('loadFiles で最初のファイルが activeFile になる', async () => {
    const { result } = renderHook(() => useFiles());
    await act(() => result.current.loadFiles());
    expect(result.current.activeFile).toBe(mockFiles[0].path);
  });

  test('loadFiles の戻り値はファイル一覧', async () => {
    const { result } = renderHook(() => useFiles());
    let returned: FileEntry[] = [];
    await act(async () => {
      returned = await result.current.loadFiles();
    });
    expect(returned).toEqual(mockFiles);
  });

  test('loadFiles でエラーが起きても空配列を返す', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useFiles());
    let returned: FileEntry[] = [];
    await act(async () => {
      returned = await result.current.loadFiles();
    });
    expect(returned).toEqual([]);
    expect(result.current.files).toEqual([]);
  });

  test('switchFile で activeFile が更新される', async () => {
    const { result } = renderHook(() => useFiles());
    await act(() => result.current.loadFiles());
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}'));
    await act(() => result.current.switchFile(mockFiles[1].path));
    expect(result.current.activeFile).toBe(mockFiles[1].path);
  });

  test('switchFile が POST /active-file を呼ぶ', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const { result } = renderHook(() => useFiles());
    await act(() => result.current.switchFile('/some/file.md'));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/active-file',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('setActiveFile で直接 activeFile を変更できる', () => {
    const { result } = renderHook(() => useFiles());
    act(() => result.current.setActiveFile('/manual/path.md'));
    expect(result.current.activeFile).toBe('/manual/path.md');
  });

  test('loadFiles でサーバーの activeFile が常に優先される', async () => {
    const { result } = renderHook(() => useFiles());
    act(() => result.current.setActiveFile('/already/set.md'));
    await act(() => result.current.loadFiles());
    expect(result.current.activeFile).toBe(mockFiles[0].path);
  });
});
