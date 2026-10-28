import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Inspecting media source and available formats...',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-state"
      className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 sm:w-56">
          <div className="absolute inset-0 animate-pulse bg-slate-200/60 dark:bg-slate-700/40" />
          <Loader2 className="relative z-10 h-7 w-7 animate-spin text-indigo-600 dark:text-indigo-400" />
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{message}</span>
          </div>
          <div className="h-5 w-3/4 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-1/2 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          <div className="pt-2">
            <div className="h-10 w-44 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
};
