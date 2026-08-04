import { useMemo, useState } from 'react';
import { extractTasks } from '../../lib/docScan.ts';
import { WidgetEmpty, WidgetPanel } from './WidgetPanel.tsx';
import styles from './widgets.module.css';

interface TasksWidgetProps {
  source: string;
  onSelectLine: (line: number) => void;
}

/**
 * タスク一覧ウィジェット。本文の `- [ ]` / `- [x]` を集めて、選ぶと該当行へ
 * 飛ぶ。チェックの切り替えはしない（nymph は本文を書き換えないツールで、
 * 編集はエディタ側の仕事）。
 */
export function TasksWidget({ source, onSelectLine }: TasksWidgetProps) {
  const tasks = useMemo(() => extractTasks(source), [source]);
  const [openOnly, setOpenOnly] = useState(false);
  const done = tasks.filter((t) => t.done).length;
  const shown = openOnly ? tasks.filter((t) => !t.done) : tasks;

  return (
    <WidgetPanel
      title="タスク"
      testId="tasks-widget"
      meta={tasks.length > 0 ? `${done} / ${tasks.length}` : undefined}
      toolbar={
        tasks.length > 0 ? (
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.filterBtn}
              data-testid="tasks-widget-open-only"
              aria-pressed={openOnly}
              title="未完のタスクだけを表示する"
              onClick={() => setOpenOnly((v) => !v)}
            >
              未完のみ
            </button>
          </div>
        ) : undefined
      }
    >
      {tasks.length === 0 && (
        <WidgetEmpty>チェックボックス（- [ ]）がありません</WidgetEmpty>
      )}
      {tasks.length > 0 && shown.length === 0 && (
        <WidgetEmpty>未完のタスクはありません</WidgetEmpty>
      )}
      <div className={styles.list}>
        {shown.map((t) => (
          <button
            type="button"
            key={`${t.line}`}
            className={`${styles.item} ${t.done ? styles.itemDone : ''}`}
            data-testid="tasks-widget-item"
            data-done={String(t.done)}
            data-line={t.line}
            style={{ paddingLeft: 8 + t.depth * 12 }}
            title={`${t.line}行目`}
            onClick={() => onSelectLine(t.line)}
          >
            <span className={styles.check} aria-hidden="true">
              {t.done ? '☑' : '☐'}
            </span>
            <span className={styles.itemText}>{t.text}</span>
            <span className={styles.lineNo}>{t.line}</span>
          </button>
        ))}
      </div>
    </WidgetPanel>
  );
}
