import DOMPurify from 'dompurify';

/**
 * marked が生成する HTML を DOMPurify で sanitize する。
 *
 * - script / style / iframeなどの危険要素を除去
 * - onclick / onerror などのイベントハンドラを除去
 * - javascript: / data:text/html などの危険な URI スキームを除去
 * - hljs や language-* クラス属性、通常の href は維持
 * - target 属性は DOMPurify 既定で除去されるため、リンクは同タブ遷移となり
 *   reverse tabnabbing（target="_blank" 経由の window.opener 悪用）の余地はない
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // data-* 属性はアプリ側のものはコンポーネント JSX で付与するので不要。
    // ただし code の class="language-* hljs" は許可（ALLOW_DATA_ATTR と無関係）。
    ALLOW_DATA_ATTR: false,
    // style 要素は CSS インジェクション（クリック乗っ取り等）に悪用できるため除外。
    FORBID_TAGS: ['style'],
  });
}
