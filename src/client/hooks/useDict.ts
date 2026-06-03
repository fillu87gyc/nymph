import useSWR from 'swr';
import { fetcher } from '../lib/fetcher.ts';
import type { DictResponse } from '../types.ts';

export function useDict() {
  const { data, mutate, isLoading } = useSWR<DictResponse>('/dict', fetcher);
  return {
    entries: data?.entries ?? [],
    updatedAt: data?.updatedAt ?? '',
    isLoading,
    revalidate: () => mutate(),
  };
}
