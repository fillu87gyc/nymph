import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useDiff } from '../../src/client/hooks/useDiff.ts';
import type { DiffResponse } from '../../src/client/types.ts';

const emptyDiff: DiffResponse = { lines: [], hasCheckpoint: false };
const sampleDiff: DiffResponse = {
  hasCheckpoint: true,
  lines: [
    { n: 1, o: 1, type: 'equal', content: 'unchanged', g: null },
    { n: null, o: 2, type: 'delete', content: 'old', g: 0 },
    { n: 2, o: null, type: 'insert', content: 'new', g: 0 },
  ],
};

function mockFetch(data: unknown) {
  // Response の body は一度しか読めないため、呼び出しごとに新しいインスタンスを返す
  return vi.spyOn(global, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

beforeEach(() => {
  mockFetch({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDiff', () => {
  test('初期状態: diffMode=false・diffData=null・checkpointSet=false', () => {
    const { result } = renderHook(() => useDiff());
    expect(result.current.diffMode).toBe(false);
    expect(result.current.diffData).toBeNull();
    expect(result.current.checkpointSet).toBe(false);
  });

  test('setCheckpoint が POST /checkpoint を呼び checkpointSet=true になる', async () => {
    mockFetch({ ok: true, lines: 10 });
    const { result } = renderHook(() => useDiff());
    let lines = 0;
    await act(async () => {
      lines = await result.current.setCheckpoint();
    });
    expect(result.current.checkpointSet).toBe(true);
    expect(lines).toBe(10);
    expect(fetch).toHaveBeenCalledWith(
      '/checkpoint',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('loadDiff が GET /diff を呼び diffData を返す', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    let returned: DiffResponse | undefined;
    await act(async () => {
      returned = await result.current.loadDiff();
    });
    expect(result.current.diffData).toEqual(sampleDiff);
    expect(returned).toEqual(sampleDiff);
  });

  test('loadDiff が hasCheckpoint から checkpointSet を復元する（永続化対応）', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    await act(async () => {
      await result.current.loadDiff();
    });
    expect(result.current.checkpointSet).toBe(true);
  });

  test('loadDiff: hasCheckpoint=false なら checkpointSet も false', async () => {
    mockFetch(emptyDiff);
    const { result } = renderHook(() => useDiff());
    await act(async () => {
      await result.current.loadDiff();
    });
    expect(result.current.checkpointSet).toBe(false);
  });

  test('toggleDiff: false→true で diff データを取得する', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    await act(async () => {
      await result.current.toggleDiff();
    });
    expect(result.current.diffMode).toBe(true);
    expect(result.current.diffData).toEqual(sampleDiff);
  });

  test('toggleDiff: true→false で通常モードに戻る', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    await act(async () => {
      await result.current.toggleDiff();
    });
    await act(async () => {
      await result.current.toggleDiff();
    });
    expect(result.current.diffMode).toBe(false);
  });

  test('showDiff: 通常モードからでも差分チェックモードに入り diff を取得する', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    await act(async () => {
      await result.current.showDiff();
    });
    expect(result.current.diffMode).toBe(true);
    expect(result.current.diffData).toEqual(sampleDiff);
  });

  test('setCheckpoint を呼ぶと diff が再取得される', async () => {
    const { result } = renderHook(() => useDiff());

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) => {
        if (String(url) === '/checkpoint') {
          return new Response(JSON.stringify({ ok: true, lines: 5 }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(sampleDiff), {
          headers: { 'Content-Type': 'application/json' },
        });
      });

    await act(async () => {
      await result.current.setCheckpoint();
    });

    const diffCalls = fetchSpy.mock.calls.filter(
      ([url]) => String(url) === '/diff',
    );
    expect(diffCalls.length).toBeGreaterThan(0);
    expect(result.current.diffData).toEqual(sampleDiff);
  });
});
