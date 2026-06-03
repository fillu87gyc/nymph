import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useDict } from '../../../src/client/hooks/useDict.ts';

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        dedupingInterval: 0,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      },
    },
    children,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('/dict が空のとき entries は []', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({ version: 1, updatedAt: '', entries: [] }),
    ok: true,
  } as Response);

  const { result } = renderHook(() => useDict(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.entries).toEqual([]);
});

test('エントリありのとき DictEntry[] が返る', async () => {
  const mockEntries = [
    {
      term: '集約',
      aliases: ['Aggregate'],
      definition: '集約とは...',
      definitionHtml: '<p>集約とは...</p>',
      source: 'glossary',
      sourceRef: '',
    },
    {
      term: 'エンティティ',
      aliases: ['Entity'],
      definition: 'エンティティとは...',
      definitionHtml: '<p>エンティティとは...</p>',
      source: 'glossary',
      sourceRef: '',
    },
  ];
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      entries: mockEntries,
    }),
    ok: true,
  } as Response);

  const { result } = renderHook(() => useDict(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.entries).toHaveLength(2);
  expect(result.current.entries[0].term).toBe('集約');
  expect(result.current.updatedAt).toBe('2024-01-01T00:00:00Z');
});
