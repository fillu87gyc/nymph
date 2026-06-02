import { describe, expect, test } from 'vitest';
import { sanitizeHtml } from '../../src/client/lib/sanitize.ts';

describe('sanitizeHtml', () => {
  test('通常の Markdown 由来 HTML を維持する', () => {
    const html = '<h1>Title</h1><p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(html)).toContain('<h1>Title</h1>');
    expect(sanitizeHtml(html)).toContain('<strong>world</strong>');
  });

  test('<script> を除去する', () => {
    const html = '<p>text</p><script>alert("xss")</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>text</p>');
  });

  test('インライン onerror を除去する', () => {
    const html = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('onerror');
  });

  test('onclick を除去する', () => {
    const html = '<p onclick="evil()">click</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('onclick');
    expect(result).toContain('click');
  });

  test('javascript: URL を除去する', () => {
    const html = '<a href="javascript:alert(1)">link</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('javascript:');
  });

  test('通常の href を維持する', () => {
    const html = '<a href="https://example.com">link</a>';
    expect(sanitizeHtml(html)).toContain('href="https://example.com"');
  });

  test('コードの class 属性を維持する（hljs 用）', () => {
    const html =
      '<pre><code class="language-ts hljs">const x = 1;</code></pre>';
    const result = sanitizeHtml(html);
    expect(result).toContain('class="language-ts hljs"');
  });

  test('<style> ブロックを除去する', () => {
    const html = '<p>text</p><style>body{display:none}</style>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<style>');
    expect(result).toContain('<p>text</p>');
  });

  test('data: URL を属性から除去する', () => {
    // data: URI in src can be used for XSS in some browsers
    const html = '<a href="data:text/html,<script>alert(1)</script>">x</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('data:text/html');
  });

  test('テーブルの HTML を維持する', () => {
    const html =
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<table>');
    expect(result).toContain('<th>A</th>');
    expect(result).toContain('<td>1</td>');
  });

  test('空文字列は空文字列を返す', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
