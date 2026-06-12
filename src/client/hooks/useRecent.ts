import useSWR from 'swr';
import { fetcher } from '../lib/fetcher.ts';
import type { RecentEntry } from '../types.ts';

export function useRecent() {
  const { data } = useSWR<{ files: RecentEntry[] }>('/recent', fetcher, {
    fallbackData: { files: [] },
  });

  return { recentFiles: data?.files ?? [] };
}
