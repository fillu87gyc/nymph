import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  contentKeyFor,
  DROPPED_CONTENT_KEY,
  useContent,
} from '../../../src/client/hooks/useContent.ts';
import { DROPPED_PATH } from '../../../src/dropped.ts';

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

test('activeFile が __dropped__ のとき /content（パラメータなし）をフェッチ', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({ content: '# dropped', filename: 'dropped.md' }),
    ok: true,
  } as Response);

  const { result } = renderHook(() => useContent('__dropped__'), { wrapper });
  await waitFor(() => expect(result.current.source).toBe('# dropped'));
  expect(result.current.contentKey).toBe('/content');
});

test('contentKeyFor: 実ファイルはパス付きのキーになる', () => {
  expect(contentKeyFor('/docs/a b.md')).toBe(
    `/content?file=${encodeURIComponent('/docs/a b.md')}`,
  );
});

// 擬似タブと「1つも開いていない」が同じキーになるため、この2状態のあいだの
// 遷移では SWR がキー変化を検知できない（＝勝手には取り直さない）。全ファイルを
// 閉じたときに本文を消すには、閉じる側が明示的に revalidate する必要がある。
test('contentKeyFor: 擬似タブと未選択は同じキーに衝突する', () => {
  expect(contentKeyFor(DROPPED_PATH)).toBe(DROPPED_CONTENT_KEY);
  expect(contentKeyFor(null)).toBe(DROPPED_CONTENT_KEY);
  expect(contentKeyFor(undefined)).toBe(DROPPED_CONTENT_KEY);
});

test('activeFile が undefined（/files 未解決）の間は fetch しない', async () => {
  const fetchMock = vi.mocked(fetch);
  renderHook(() => useContent(undefined), { wrapper });
  // SWR の fetch は useEffect 経由で非同期に発火するため、setTimeout(0) 一回分の
  // 待ちでは早すぎて発火前に判定してしまう（false negative）ことがある。
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
