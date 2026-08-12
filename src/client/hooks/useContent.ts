import { useState } from 'react';
import useSWR from 'swr';
import { isDroppedPath } from '../../dropped.ts';
import { fetcher } from '../lib/fetcher.ts';

interface ContentData {
  content: string;
  filename: string | null;
}

const FALLBACK: ContentData = { content: '', filename: null };

/**
 * ドロップ由来の擬似タブ（およびファイル未選択）の内容を指す SWR キー。
 * 擬似タブにはパスが無いため file パラメータを付けない。
 */
export const DROPPED_CONTENT_KEY = '/content';

/**
 * activeFile に対応する本文の SWR キー。
 *
 * 擬似タブ（ドロップ）と「ファイルを1つも開いていない」状態は、どちらも
 * パスを持たないので同じ `DROPPED_CONTENT_KEY` になる。キーが同じままの
 * 遷移では SWR は取り直さないため、その遷移を起こす側（タブを閉じる処理）が
 * 明示的に revalidate する必要がある。
 */
export function contentKeyFor(activeFile: string | null | undefined): string {
  return activeFile && !isDroppedPath(activeFile)
    ? `/content?file=${encodeURIComponent(activeFile)}`
    : DROPPED_CONTENT_KEY;
}

export function useContent(activeFile: string | null | undefined) {
  const [updateTime, setUpdateTime] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('ファイルを読み込んでいます…');

  const key = contentKeyFor(activeFile);

  // activeFile === undefined は /files 未解決を示すポーズ用センチネル。
  // ここで無条件に '/content' を叩くと、直後に file 確定後の
  // '/content?file=...' フェッチが走り二重取得になる（本番の初期表示でも
  // 無駄なラウンドトリップになっていた）。
  const { data } = useSWR<ContentData>(
    activeFile === undefined ? null : key,
    fetcher,
    {
      fallbackData: FALLBACK,
      keepPreviousData: true,
      onSuccess: (d) => {
        if (d.filename === null) setWelcomeMsg('.md ファイルをここにドロップ');
        setUpdateTime(
          `更新: ${new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`,
        );
      },
    },
  );

  return {
    source: data?.content ?? '',
    updateTime,
    welcomeMsg,
    contentKey: key,
  };
}
