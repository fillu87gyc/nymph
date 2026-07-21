import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateCommentId } from '../../src/client/lib/commentId.ts';

describe('generateCommentId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('c_ + 6桁hex の形式で返す', () => {
    const id = generateCommentId([]);
    expect(id).toMatch(/^c_[0-9a-f]{6}$/);
  });

  it('既存 ID（数値含む）と重複しない', () => {
    const existing = [1, 2, 'c_aaaaaa', 'c_bbbbbb'];
    const id = generateCommentId(existing);
    expect(existing).not.toContain(id);
  });

  it('生成のたびに異なる ID になる（十分な確率で）', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => generateCommentId([])),
    );
    expect(ids.size).toBe(50);
  });

  it('衝突した場合は再生成して既存と重複しない ID を返す', () => {
    // 1回目は既存の 'c_a3f8b2' と衝突する値、2回目は衝突しない値を返す
    const collide = new Uint8Array([0xa3, 0xf8, 0xb2]);
    const fresh = new Uint8Array([0x11, 0x22, 0x33]);
    let call = 0;
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((
      arr: Uint8Array,
    ) => {
      arr.set(call === 0 ? collide : fresh);
      call++;
      return arr;
    }) as typeof crypto.getRandomValues);

    const id = generateCommentId(['c_a3f8b2']);
    expect(id).toBe('c_112233');
    expect(call).toBe(2);
  });
});
