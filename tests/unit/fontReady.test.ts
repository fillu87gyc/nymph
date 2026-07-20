/**
 * waitForFonts のユニットテスト
 *
 * jsdom は document.fonts (FontFaceSet) を実装していないため、
 * モックを defineProperty で注入して挙動を検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForFonts } from '../../src/client/lib/fontReady.ts';

interface FontsMock {
  load: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
  ready: Promise<unknown>;
}

function installFontsMock(overrides: Partial<FontsMock> = {}): FontsMock {
  const mock: FontsMock = {
    load: vi.fn().mockResolvedValue([]),
    check: vi.fn().mockReturnValue(true),
    ready: Promise.resolve(),
    ...overrides,
  };
  Object.defineProperty(document, 'fonts', {
    value: mock,
    configurable: true,
  });
  return mock;
}

function addStylesheetLink(): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://example.com/fonts.css';
  document.head.appendChild(link);
  return link;
}

describe('waitForFonts', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: テスト用モックの後始末
    delete (document as any).fonts;
    document.head.innerHTML = '';
  });

  it('document.fonts が無い環境では何もせず解決する', async () => {
    await expect(
      waitForFonts(['16px "JetBrains Mono"']),
    ).resolves.toBeUndefined();
  });

  it('stylesheet link の load を待ってからフォントを load する', async () => {
    const fonts = installFontsMock();
    const link = addStylesheetLink();

    let resolved = false;
    const p = waitForFonts(['16px "JetBrains Mono"']).then(() => {
      resolved = true;
    });

    // link が未決着の間は完了しない
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    expect(fonts.load).not.toHaveBeenCalled();

    link.dispatchEvent(new Event('load'));
    await p;
    expect(fonts.load).toHaveBeenCalledWith('16px "JetBrains Mono"');
  });

  it('stylesheet link が error でも解決する（オフラインフォールバック）', async () => {
    installFontsMock();
    const link = addStylesheetLink();

    const p = waitForFonts(['16px "JetBrains Mono"']);
    link.dispatchEvent(new Event('error'));
    await expect(p).resolves.toBeUndefined();
  });

  it('link が決着しない場合も timeoutMs 経過で解決する', async () => {
    installFontsMock();
    addStylesheetLink();

    const start = Date.now();
    await waitForFonts(['16px "JetBrains Mono"'], 50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it('一度決着を待った link は次回以降待たない', async () => {
    installFontsMock();
    const link = addStylesheetLink();

    const p = waitForFonts(['16px "JetBrains Mono"']);
    link.dispatchEvent(new Event('load'));
    await p;

    // 2 回目は同じ link を再度待たず即座に解決する
    const start = Date.now();
    await waitForFonts(['16px "JetBrains Mono"'], 5000);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('fonts.load の失敗（NetworkError 等）は握りつぶして解決する', async () => {
    installFontsMock({
      load: vi.fn().mockRejectedValue(new Error('network')),
    });
    await expect(
      waitForFonts(['16px "JetBrains Mono"']),
    ).resolves.toBeUndefined();
  });

  it('複数フォント指定をすべて load する', async () => {
    const fonts = installFontsMock();
    await waitForFonts(['16px "JetBrains Mono"', '500 16px "JetBrains Mono"']);
    expect(fonts.load).toHaveBeenCalledTimes(2);
  });
});
