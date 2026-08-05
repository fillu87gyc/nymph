import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SearchWidget } from '../../../src/client/components/widgets/SearchWidget.tsx';
import type { SearchResponse } from '../../../src/client/types.ts';

const RESPONSE: SearchResponse = {
  query: 'design',
  truncated: false,
  results: [
    {
      path: '/docs/a.md',
      name: 'a.md',
      nameMatch: false,
      matches: [
        {
          line: 12,
          text: 'the design doc',
          start: 4,
          end: 10,
          before: [],
          after: [],
        },
      ],
    },
  ],
};

function mockSearch(res: SearchResponse = RESPONSE) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(res) } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('SearchWidget', () => {
  test('入力するまでは使い方だけを出す', () => {
    mockSearch();
    render(<SearchWidget onOpenFileAtLine={vi.fn()} />);
    expect(screen.getByTestId('search-widget')).toHaveTextContent(
      'ツリー配下の .md から探します',
    );
  });

  test('1文字では検索せず、2文字以上で結果を出す', async () => {
    const fetchMock = mockSearch();
    render(<SearchWidget onOpenFileAtLine={vi.fn()} />);
    const input = screen.getByTestId('search-widget-input');

    await userEvent.type(input, 'd');
    expect(screen.getByTestId('search-widget')).toHaveTextContent(
      '2文字以上で検索します',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.type(input, 'esign');
    await waitFor(() =>
      expect(screen.getByTestId('search-widget-match')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('search-widget-meta')).toHaveTextContent('1件');
    // ファイル名の見出しと、一致部分のハイライト
    expect(screen.getByTestId('search-widget')).toHaveTextContent('a.md');
    expect(screen.getByRole('mark')).toHaveTextContent('design');
  });

  test('結果を選ぶとファイルと行を渡す', async () => {
    mockSearch();
    const onOpenFileAtLine = vi.fn();
    render(<SearchWidget onOpenFileAtLine={onOpenFileAtLine} />);
    await userEvent.type(screen.getByTestId('search-widget-input'), 'design');
    await waitFor(() =>
      expect(screen.getByTestId('search-widget-match')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId('search-widget-match'));
    expect(onOpenFileAtLine).toHaveBeenCalledWith('/docs/a.md', 12);
  });

  test('一致が無ければその旨を出す', async () => {
    mockSearch({ query: 'zzz', results: [], truncated: false });
    render(<SearchWidget onOpenFileAtLine={vi.fn()} />);
    await userEvent.type(screen.getByTestId('search-widget-input'), 'zzz');
    await waitFor(() =>
      expect(screen.getByTestId('search-widget')).toHaveTextContent(
        '一致する行がありません',
      ),
    );
  });
});
