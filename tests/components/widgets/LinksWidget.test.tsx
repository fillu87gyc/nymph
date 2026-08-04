import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LinksWidget } from '../../../src/client/components/widgets/LinksWidget.tsx';

const SRC = [
  '[外部](https://example.com)',
  '',
  '[生きてる](./alive.md) と [切れてる](./dead.md)',
  '',
  '![図](../out/of/scope.png)',
].join('\n');

/** POST /link-check の応答を差し替える。 */
function mockLinkCheck(
  results: { target: string; exists: boolean | null }[] = [
    { target: './alive.md', exists: true },
    { target: './dead.md', exists: false },
    { target: '../out/of/scope.png', exists: null },
  ],
) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results }),
    } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('LinksWidget', () => {
  test('リンクと画像を種別つきで並べる', () => {
    mockLinkCheck();
    render(<LinksWidget source={SRC} onSelectLine={vi.fn()} />);
    const items = screen.getAllByTestId('links-widget-item');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAttribute('data-category', 'external');
    expect(items[1]).toHaveAttribute('data-category', 'relative');
    expect(items[3]).toHaveAttribute('data-kind', 'image');
  });

  test('相対リンクの生死をサーバーに問い合わせて示す', async () => {
    const fetchMock = mockLinkCheck();
    render(<LinksWidget source={SRC} onSelectLine={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/link-check');
    expect(JSON.parse(String(init.body))).toEqual({
      targets: ['./alive.md', './dead.md', '../out/of/scope.png'],
    });

    await waitFor(() => {
      const items = screen.getAllByTestId('links-widget-item');
      expect(items[1]).toHaveAttribute('data-exists', 'true');
      expect(items[2]).toHaveAttribute('data-exists', 'false');
      // 範囲外は「未確認」のまま
      expect(items[3]).toHaveAttribute('data-exists', 'null');
    });
    // 切れているリンクの件数をヘッダーに出す
    expect(screen.getByTestId('links-widget-meta')).toHaveTextContent('切れ 1');
  });

  test('外部リンクには生死を出さず、新しいタブで開くリンクを添える', () => {
    mockLinkCheck();
    render(<LinksWidget source={SRC} onSelectLine={vi.fn()} />);
    expect(screen.getAllByTestId('links-widget-status')).toHaveLength(3);
    const open = screen.getByTestId('links-widget-open');
    expect(open).toHaveAttribute('href', 'https://example.com');
    expect(open).toHaveAttribute('target', '_blank');
  });

  test('選ぶとその行へジャンプする', async () => {
    mockLinkCheck();
    const onSelectLine = vi.fn();
    render(<LinksWidget source={SRC} onSelectLine={onSelectLine} />);
    await userEvent.click(screen.getAllByTestId('links-widget-item')[1]);
    expect(onSelectLine).toHaveBeenCalledWith(3);
  });

  test('リンクが無ければ問い合わせもしない', () => {
    const fetchMock = mockLinkCheck();
    render(<LinksWidget source="# なし" onSelectLine={vi.fn()} />);
    expect(screen.getByTestId('links-widget')).toHaveTextContent(
      'リンクも画像もありません',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
