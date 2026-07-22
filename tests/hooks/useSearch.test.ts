import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useSearch } from '../../src/client/hooks/useSearch.ts';
import type { SearchFileResult } from '../../src/client/types.ts';

const mockResults: SearchFileResult[] = [
  {
    path: '/docs/a.md',
    name: 'a.md',
    nameMatch: false,
    matches: [
      { line: 3, text: 'zephyr here', start: 0, end: 6, before: [], after: [] },
    ],
  },
];

function mockFetch(body: unknown) {
  return vi.spyOn(global, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSearch', () => {
  test('クエリが2文字以上ならデバウンス後に /search を叩いて結果を返す', async () => {
    const spy = mockFetch({
      query: 'zephyr',
      results: mockResults,
      truncated: false,
    });
    const { result } = renderHook(() => useSearch('zephyr', true));
    await waitFor(() => {
      expect(result.current.results).toEqual(mockResults);
    });
    expect(spy).toHaveBeenCalledWith('/search?q=zephyr');
    expect(result.current.truncated).toBe(false);
  });

  test('2文字未満のクエリでは fetch せず空結果', async () => {
    const spy = mockFetch({ query: 'z', results: [], truncated: false });
    const { result } = renderHook(() => useSearch('z', true));
    // デバウンス時間より長く待っても fetch されない
    await new Promise((r) => setTimeout(r, 250));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  test('enabled=false では fetch しない', async () => {
    const spy = mockFetch({ query: 'zephyr', results: [], truncated: false });
    renderHook(() => useSearch('zephyr', false));
    await new Promise((r) => setTimeout(r, 250));
    expect(spy).not.toHaveBeenCalled();
  });

  test('クエリを空に戻すと結果もクリアされる', async () => {
    mockFetch({ query: 'zephyr', results: mockResults, truncated: false });
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearch(q, true),
      { initialProps: { q: 'zephyr' } },
    );
    await waitFor(() => {
      expect(result.current.results).toEqual(mockResults);
    });
    rerender({ q: '' });
    await waitFor(() => {
      expect(result.current.results).toEqual([]);
    });
  });

  test('クエリはエンコードされる', async () => {
    const spy = mockFetch({ query: 'a b', results: [], truncated: false });
    renderHook(() => useSearch('a b', true));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('/search?q=a%20b');
    });
  });
});
