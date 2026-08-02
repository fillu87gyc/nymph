import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '../lib/fetcher.ts';

interface ContentData {
  content: string;
  filename: string | null;
}

const FALLBACK: ContentData = { content: '', filename: null };

export function useContent(activeFile: string | null | undefined) {
  const [updateTime, setUpdateTime] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('ファイルを読み込んでいます…');

  const key =
    activeFile && activeFile !== '__dropped__'
      ? `/content?file=${encodeURIComponent(activeFile)}`
      : '/content';

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
