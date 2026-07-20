/**
 * waitForFonts のユニットテスト
 *
 * jsdom は document.fonts (FontFaceSet) を実装していないため、
 * モックを defineProperty で注入して挙動を検証する。
 *
 * 実時間（Date.now 比較や実 setTimeout 待ち）に依存すると遅い CI で
 * フレークするため、時間に関する検証はすべて fake timers で決定的に行う。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** fake timers 環境でマイクロタスクを消化し、promise の解決状態を確定させる */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('waitForFonts', () => {
  afterEach(() => {
    vi.useRealTimers();
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
    vi.useFakeTimers();
    const fonts = installFontsMock();
    const link = addStylesheetLink();

    let resolved = false;
    void waitForFonts(['16px "JetBrains Mono"']).then(() => {
      resolved = true;
    });

    // link が未決着の間は完了せず、フォントの load も呼ばれない
    await flushMicrotasks();
    expect(resolved).toBe(false);
    expect(fonts.load).not.toHaveBeenCalled();

    link.dispatchEvent(new Event('load'));
    await flushMicrotasks();
    expect(resolved).toBe(true);
    expect(fonts.load).toHaveBeenCalledWith('16px "JetBrains Mono"');
  });

  it('stylesheet link が error でも解決する（オフラインフォールバック）', async () => {
    vi.useFakeTimers();
    installFontsMock();
    const link = addStylesheetLink();

    let resolved = false;
    void waitForFonts(['16px "JetBrains Mono"']).then(() => {
      resolved = true;
    });
    link.dispatchEvent(new Event('error'));
    await flushMicrotasks();
    expect(resolved).toBe(true);
  });

  it('link が決着しない場合も timeoutMs 経過で解決する', async () => {
    vi.useFakeTimers();
    installFontsMock();
    addStylesheetLink();

    let resolved = false;
    void waitForFonts(['16px "JetBrains Mono"'], 3000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('一度決着を待った link は次回以降待たない', async () => {
    vi.useFakeTimers();
    installFontsMock();
    const link = addStylesheetLink();

    let resolved1 = false;
    void waitForFonts(['16px "JetBrains Mono"']).then(() => {
      resolved1 = true;
    });
    link.dispatchEvent(new Event('load'));
    await flushMicrotasks();
    expect(resolved1).toBe(true);

    // 2 回目はタイマーを一切進めずに解決する（= 同じ link を待ち直さない。
    // link.sheet は jsdom では null のままなので、memo が効かなければ
    // timeout まで待つことになり resolved2 は false になる）
    let resolved2 = false;
    void waitForFonts(['16px "JetBrains Mono"'], 3000).then(() => {
      resolved2 = true;
    });
    await flushMicrotasks();
    expect(resolved2).toBe(true);
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
