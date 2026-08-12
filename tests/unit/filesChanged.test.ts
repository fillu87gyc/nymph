import { describe, expect, it } from 'vitest';
import {
  notifyFilesChanged,
  subscribeFilesChanged,
} from '../../src/filesChanged.ts';

// タブ一覧の変化を SSE 接続へ配る購読機構。
// 「別プロセスの委譲でタブが増えたのに画面が追従しない」を直すための土台で、
// SSE ストリーム（src/server.ts の handleWatch）が購読者になる。
describe('filesChanged', () => {
  it('購読者に通知が届く', () => {
    let calls = 0;
    const off = subscribeFilesChanged(() => {
      calls++;
    });
    try {
      notifyFilesChanged();
      expect(calls).toBe(1);
      notifyFilesChanged();
      expect(calls).toBe(2);
    } finally {
      off();
    }
  });

  it('複数の購読者すべてに届く（ブラウザを複数開いている場合）', () => {
    const seen: string[] = [];
    const offA = subscribeFilesChanged(() => seen.push('a'));
    const offB = subscribeFilesChanged(() => seen.push('b'));
    try {
      notifyFilesChanged();
      expect(seen).toEqual(['a', 'b']);
    } finally {
      offA();
      offB();
    }
  });

  it('購読解除するとそれ以降は届かない（接続が切れた後に配らない）', () => {
    let calls = 0;
    const off = subscribeFilesChanged(() => {
      calls++;
    });
    notifyFilesChanged();
    off();
    notifyFilesChanged();
    expect(calls).toBe(1);
  });

  it('購読解除を二重に呼んでも他の購読者に影響しない', () => {
    let calls = 0;
    const offA = subscribeFilesChanged(() => {});
    const offB = subscribeFilesChanged(() => {
      calls++;
    });
    try {
      offA();
      offA();
      notifyFilesChanged();
      expect(calls).toBe(1);
    } finally {
      offB();
    }
  });

  it('通知中に購読解除しても残りの購読者へ配り切る', () => {
    // SSE ストリームは emit の途中でクライアント切断を検知して解除しうる。
    // Set を直接回していると、この解除で以降の購読者が飛ばされる。
    const seen: string[] = [];
    let offSelf: (() => void) | null = null;
    offSelf = subscribeFilesChanged(() => {
      seen.push('first');
      offSelf?.();
    });
    const offLast = subscribeFilesChanged(() => seen.push('last'));
    try {
      notifyFilesChanged();
      expect(seen).toEqual(['first', 'last']);
    } finally {
      offSelf?.();
      offLast();
    }
  });

  it('購読者がいなくても notify は落ちない', () => {
    expect(() => notifyFilesChanged()).not.toThrow();
  });
});
