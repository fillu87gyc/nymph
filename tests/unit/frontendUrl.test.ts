import { describe, expect, it } from 'vitest';
import {
  backendUrl,
  normalizeFrontendUrl,
  resolveFrontendUrl,
} from '../../src/frontendUrl.ts';

describe('normalizeFrontendUrl', () => {
  it('http/https の URL はそのまま受け付ける', () => {
    expect(normalizeFrontendUrl('http://localhost:5173')).toBe(
      'http://localhost:5173',
    );
    expect(normalizeFrontendUrl('https://example.test')).toBe(
      'https://example.test',
    );
  });

  it('末尾スラッシュを落とす（表示とフォールバック判定を揃えるため）', () => {
    expect(normalizeFrontendUrl('http://localhost:5173/')).toBe(
      'http://localhost:5173',
    );
  });

  it('前後の空白を無視する', () => {
    expect(normalizeFrontendUrl('  http://localhost:5173  ')).toBe(
      'http://localhost:5173',
    );
  });

  it('未指定・空文字は null', () => {
    expect(normalizeFrontendUrl(undefined)).toBeNull();
    expect(normalizeFrontendUrl('')).toBeNull();
    expect(normalizeFrontendUrl('   ')).toBeNull();
  });

  it('URL として解釈できない値は null', () => {
    expect(normalizeFrontendUrl('localhost:5173')).toBeNull();
    expect(normalizeFrontendUrl('5173')).toBeNull();
  });

  it('http/https 以外のスキームは null', () => {
    expect(normalizeFrontendUrl('file:///tmp/index.html')).toBeNull();
    expect(normalizeFrontendUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('resolveFrontendUrl', () => {
  it('NYMPH_FRONTEND_URL があればそれを使う（dev の Vite dev server）', () => {
    expect(resolveFrontendUrl(6276, 'http://localhost:5173')).toBe(
      'http://localhost:5173',
    );
  });

  it('未指定ならバックエンド自身が dist/ を配る前提の URL', () => {
    expect(resolveFrontendUrl(6276, undefined)).toBe('http://localhost:6276');
    expect(resolveFrontendUrl(8080, '')).toBe('http://localhost:8080');
  });

  it('不正な値は無視してバックエンドの URL にフォールバックする', () => {
    expect(resolveFrontendUrl(6276, 'not a url')).toBe('http://localhost:6276');
  });
});

describe('backendUrl', () => {
  it('表示用に localhost を使う', () => {
    expect(backendUrl(6276)).toBe('http://localhost:6276');
  });
});
