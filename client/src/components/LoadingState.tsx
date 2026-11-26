import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Reading media info and formats…',
}) => (
  <div
    role="status"
    aria-live="polite"
    data-testid="loading-state"
    className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 sm:gap-8 border-t border-line pt-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
  >
    <div className="-mx-4 aspect-[4/5] max-h-[75vh] animate-pulse bg-line/60 sm:mx-0 sm:aspect-video sm:max-h-none sm:rounded-md" />
    <div className="space-y-4">
      <p className="font-mono text-[13px] text-muted">{message}</p>
      <div className="h-6 w-4/5 animate-pulse rounded bg-line/70" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-line/50" />
      <div className="space-y-2 pt-4">
        <div className="h-12 animate-pulse rounded-md bg-line/50" />
        <div className="h-12 animate-pulse rounded-md bg-line/40" />
      </div>
    </div>
  </div>
);
