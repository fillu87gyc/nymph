import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '../lib/fetcher.ts';

interface ContentData {
  content: string;
  filename: string | null;
}

const FALLBACK: ContentData = { content: '', filename: null };

export function useContent(activeFile: string | null) {
  const [updateTime, setUpdateTime] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('ファイルを読み込んでいます…');

  const key =
    activeFile && activeFile !== '__dropped__'
      ? `/content?file=${encodeURIComponent(activeFile)}`
      : '/content';

  const { data } = useSWR<ContentData>(key, fetcher, {
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
  });

  return {
    source: data?.content ?? '',
    updateTime,
    welcomeMsg,
    contentKey: key,
  };
}
