import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useDiff } from '../../src/client/hooks/useDiff.ts';
import type { DiffResponse } from '../../src/client/types.ts';

const emptyDiff: DiffResponse = { lines: [] };
const sampleDiff: DiffResponse = {
  lines: [
    { n: 1, type: 'equal', content: 'unchanged', g: null },
    { n: null, type: 'delete', content: 'old', g: 0 },
    { n: 2, type: 'insert', content: 'new', g: 0 },
  ],
};

function mockFetch(data: unknown) {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
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
    let lines: number;
    await act(async () => {
      lines = await result.current.setCheckpoint();
    });
    expect(result.current.checkpointSet).toBe(true);
    expect(lines!).toBe(10);
    expect(fetch).toHaveBeenCalledWith(
      '/checkpoint',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('loadDiff が GET /diff を呼び diffData を返す', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    let returned: DiffResponse;
    await act(async () => {
      returned = await result.current.loadDiff();
    });
    expect(result.current.diffData).toEqual(sampleDiff);
    expect(returned!).toEqual(sampleDiff);
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

  test('toggleDiff: true→false で diffData が null になる', async () => {
    mockFetch(sampleDiff);
    const { result } = renderHook(() => useDiff());
    await act(async () => {
      await result.current.toggleDiff();
    });
    mockFetch({});
    await act(async () => {
      await result.current.toggleDiff();
    });
    expect(result.current.diffMode).toBe(false);
    expect(result.current.diffData).toBeNull();
  });

  test('diffMode=true のときに setCheckpoint を呼ぶと diff が再取得される', async () => {
    const { result } = renderHook(() => useDiff());

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url) === '/diff') {
        return new Response(JSON.stringify(emptyDiff), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, lines: 5 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await act(async () => {
      await result.current.toggleDiff();
    });
    expect(result.current.diffMode).toBe(true);

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
