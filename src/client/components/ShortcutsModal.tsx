import { Fragment } from 'react';
import { useEscapeDismiss } from '../hooks/useDismiss.ts';
import { SHORTCUT_SECTIONS } from '../lib/shortcuts.ts';
import styles from './ShortcutsModal.module.css';

interface ShortcutsModalProps {
  onClose: () => void;
}

/**
 * `?` で出すキーボードショートカット一覧。
 *
 * 中身は `lib/shortcuts.ts` の定義をそのまま並べるだけで、この画面は
 * 独自の一覧を持たない（説明だけが実装から取り残されるのを避けるため）。
 * 開いている間だけ呼び出し側がマウントするので、開閉用の state は持たない。
 */
export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  useEscapeDismiss(onClose);

  return (
    <div
      id="shortcuts-modal"
      data-testid="shortcuts-modal"
      className={styles.modal}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={styles.box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className={styles.head}>
          <span className={styles.title} id="shortcuts-title">
            ⌨ キーボードショートカット
          </span>
          <button
            type="button"
            className="btn icon"
            id="btn-close-shortcuts"
            data-testid="shortcuts-close"
            title="閉じる"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className={styles.body}>
          {SHORTCUT_SECTIONS.map((section) => (
            <section key={section.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <dl className={styles.list}>
                {section.entries.map((entry) => (
                  <div key={entry.desc} className={styles.row}>
                    <dt className={styles.keys}>
                      {entry.keys.map((key, i) => (
                        <Fragment key={key}>
                          {i > 0 && (
                            <span className={styles.join}>
                              {entry.join ?? '+'}
                            </span>
                          )}
                          <kbd className={styles.key}>{key}</kbd>
                        </Fragment>
                      ))}
                    </dt>
                    <dd className={styles.desc}>{entry.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
