import { useMemo } from 'react';
import { useLinkCheck } from '../../hooks/useLinkCheck.ts';
import {
  extractLinks,
  type LinkItem,
  relativeTargets,
} from '../../lib/docScan.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface LinksWidgetProps {
  source: string;
  onSelectLine: (line: number) => void;
}

/** 相対リンクの判定結果の見せ方。null は「判定していない」。 */
function statusLabel(exists: boolean | null | undefined): {
  text: string;
  className: string;
  title: string;
} {
  if (exists === true)
    return { text: '✓', className: styles.statusOk, title: '実在します' };
  if (exists === false)
    return {
      text: '✗',
      className: styles.statusMissing,
      title: 'ファイルが見つかりません',
    };
  return {
    text: '?',
    className: styles.statusUnknown,
    title:
      'このリンク先は判定していません（レビュー対象の範囲外、または判定待ち）',
  };
}

/**
 * リンク / 画像一覧ウィジェット。
 *
 * 本文のリンクと画像を集めて、選ぶとその行へ飛ぶ。相対パスはサーバー
 * （POST /link-check）に実在するかを聞いて、リンク切れをその場で示す。
 * 判定はレビュー対象の範囲（ルート配下、無ければ開いているファイルの
 * ディレクトリ配下）に限られ、外に出るものは「?」のままにする。
 */
export function LinksWidget({ source, onSelectLine }: LinksWidgetProps) {
  const links = useMemo(() => extractLinks(source), [source]);
  const targets = useMemo(() => relativeTargets(links), [links]);
  const status = useLinkCheck(targets);
  const broken = targets.filter((t) => status.get(t) === false).length;

  return (
    <WidgetPanel
      title="リンク / 画像"
      testId="links-widget"
      meta={
        links.length > 0
          ? `${links.length}${broken > 0 ? ` / 切れ ${broken}` : ''}`
          : undefined
      }
    >
      {links.length === 0 && (
        <WidgetEmpty>リンクも画像もありません</WidgetEmpty>
      )}
      <div className={styles.list}>
        {links.map((l) => (
          <LinkRow
            key={`${l.line}:${l.column}`}
            link={l}
            exists={
              l.category === 'relative' ? status.get(l.target) : undefined
            }
            onSelectLine={onSelectLine}
          />
        ))}
      </div>
    </WidgetPanel>
  );
}

function LinkRow({
  link,
  exists,
  onSelectLine,
}: {
  link: LinkItem;
  exists: boolean | null | undefined;
  onSelectLine: (line: number) => void;
}) {
  const st = statusLabel(exists);
  return (
    <div className={styles.linkRow}>
      <button
        type="button"
        className={`${styles.item} ${styles.itemStack}`}
        data-testid="links-widget-item"
        data-kind={link.kind}
        data-category={link.category}
        data-line={link.line}
        data-exists={exists === undefined ? 'n/a' : String(exists)}
        title={`${link.target}（${link.line}行目）`}
        onClick={() => onSelectLine(link.line)}
      >
        <span className={styles.itemText}>
          {link.kind === 'image' ? '🖼 ' : ''}
          {link.label || link.target}
          {link.category === 'relative' && (
            <span
              className={`${styles.status} ${st.className}`}
              data-testid="links-widget-status"
              title={st.title}
            >
              {' '}
              {st.text}
            </span>
          )}
        </span>
        <span className={styles.itemSub}>{link.target}</span>
      </button>
      {link.category === 'external' && (
        <a
          className={styles.external}
          data-testid="links-widget-open"
          href={link.target}
          target="_blank"
          rel="noreferrer noopener"
          title="ブラウザの新しいタブで開く"
        >
          ↗
        </a>
      )}
    </div>
  );
}
