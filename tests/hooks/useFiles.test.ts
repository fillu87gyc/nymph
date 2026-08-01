import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useFiles } from '../../src/client/hooks/useFiles.ts';
import type { FileEntry } from '../../src/client/types.ts';

const mockFiles: FileEntry[] = [
  { path: '/docs/a.md', name: 'a.md' },
  { path: '/docs/b.md', name: 'b.md' },
];

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );

function mockFetch(response: unknown) {
  vi.spyOn(global, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

beforeEach(() => {
  mockFetch({ files: mockFiles, activeFile: mockFiles[0].path });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFiles', () => {
  test('初期状態: files=[]・activeFile=null・filesLoaded=false', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFiles(), { wrapper });
    expect(result.current.files).toEqual([]);
    expect(result.current.activeFile).toBeNull();
    expect(result.current.filesLoaded).toBe(false);
  });

  test('/files のフェッチが完了すると filesLoaded が true になる', async () => {
    const { result } = renderHook(() => useFiles(), { wrapper });
    await waitFor(() => expect(result.current.filesLoaded).toBe(true));
  });

  test('マウント後 SWR がファイル一覧を取得する', async () => {
    const { result } = renderHook(() => useFiles(), { wrapper });
    await waitFor(() => {
      expect(result.current.files).toEqual(mockFiles);
    });
  });

  test('SWR fetch 後に activeFile がサーバー値になる', async () => {
    const { result } = renderHook(() => useFiles(), { wrapper });
    await waitFor(() => {
      expect(result.current.activeFile).toBe(mockFiles[0].path);
    });
  });

  test('switchFile が POST /active-file を呼ぶ', async () => {
    const { result } = renderHook(() => useFiles(), { wrapper });
    await waitFor(() => expect(result.current.files).toEqual(mockFiles));
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('{}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await act(() => result.current.switchFile(mockFiles[1].path));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/active-file',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('switchFile 後に SWR が activeFile をサーバー値に更新する', async () => {
    mockFetch({ files: mockFiles, activeFile: mockFiles[1].path });
    const { result } = renderHook(() => useFiles(), { wrapper });
    await act(() => result.current.switchFile(mockFiles[1].path));
    await waitFor(() => {
      expect(result.current.activeFile).toBe(mockFiles[1].path);
    });
  });

  test('closeFile が POST /close-file を呼ぶ', async () => {
    const { result } = renderHook(() => useFiles(), { wrapper });
    await waitFor(() => expect(result.current.files).toEqual(mockFiles));
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            files: [mockFiles[1]],
            activeFile: mockFiles[1].path,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    await act(() => result.current.closeFile(mockFiles[0].path));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/close-file',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('closeFile はサーバーレスポンスの activeFile を返す', async () => {
    const { result } = renderHook(() => useFiles(), { wrapper });
    await waitFor(() => expect(result.current.files).toEqual(mockFiles));
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            files: [mockFiles[1]],
            activeFile: mockFiles[1].path,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.closeFile(mockFiles[0].path);
    });
    expect(returned).toBe(mockFiles[1].path);
  });
});
