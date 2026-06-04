import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useContent } from '../../../src/client/hooks/useContent.ts';

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

test('activeFile が null のとき /content をフェッチ', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({ content: 'hello', filename: null }),
    ok: true,
  } as Response);

  const { result } = renderHook(() => useContent(null), { wrapper });
  await waitFor(() => expect(result.current.source).toBe('hello'));
  expect(result.current.welcomeMsg).toBe('.md ファイルをここにドロップ');
});

test('activeFile があるとき /content?file=... をフェッチ', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({ content: '# test', filename: 'test.md' }),
    ok: true,
  } as Response);

  const { result } = renderHook(() => useContent('test.md'), { wrapper });
  await waitFor(() => expect(result.current.source).toBe('# test'));
  expect(result.current.contentKey).toContain('test.md');
});

test('フェッチ成功後 updateTime が設定される', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({ content: 'data', filename: 'doc.md' }),
    ok: true,
  } as Response);

  const { result } = renderHook(() => useContent('doc.md'), { wrapper });
  await waitFor(() => expect(result.current.updateTime).not.toBe(''));
  expect(result.current.updateTime).toMatch(/^更新:/);
});

test('初期状態で source は空文字', () => {
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useContent(null), { wrapper });
  expect(result.current.source).toBe('');
});
