import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchVideoInfo } from '../services/api';
import type { VideoMetadata } from '../types/downloader';

export const VIDEO_INFO_QUERY_KEY = ['video-info'] as const;

export function useVideoInfo() {
  const queryClient = useQueryClient();

  const mutation = useMutation<VideoMetadata, Error, string>({
    mutationKey: VIDEO_INFO_QUERY_KEY,
    mutationFn: (url: string) => fetchVideoInfo(url),
    onMutate: () => {
      // Clear any previous cached video metadata when fetching a new URL
      queryClient.removeQueries({ queryKey: VIDEO_INFO_QUERY_KEY });
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...VIDEO_INFO_QUERY_KEY, data.url], data);
    },
  });

  const resetVideoInfo = useCallback(() => {
    mutation.reset();
    queryClient.removeQueries({ queryKey: VIDEO_INFO_QUERY_KEY });
  }, [mutation, queryClient]);

  return {
    videoInfo: mutation.data ?? null,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    fetchInfo: mutation.mutate,
    fetchInfoAsync: mutation.mutateAsync,
    reset: resetVideoInfo,
  };
}
