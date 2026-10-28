import React, { useState } from 'react';
import { CheckCircle2, Download  } from 'lucide-react';
import { buildDownloadUrl } from '../services/api';
import type { DownloadOption } from '../types/downloader';

interface DownloadButtonProps {
  url: string;
  title: string;
  selectedOption: DownloadOption;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  url,
  title,
  selectedOption,
}) => {
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  const downloadHref = buildDownloadUrl({
    url,
    option: selectedOption.id,
    title,
  });

  const handleClick = () => {
    setDownloadTriggered(true);
    window.setTimeout(() => {
      setDownloadTriggered(false);
    }, 4000);
  };

  return (
    <div className="space-y-2">
      <a
        href={downloadHref}
        onClick={handleClick}
        data-testid="download-button"
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:scale-[0.99] dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Download {selectedOption.label}</span>
   
      </a>

      {downloadTriggered && (
        <p
          role="status"
          data-testid="download-started-feedback"
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            Download stream initiated! Your browser will save the media file shortly.
          </span>
        </p>
      )}
    </div>
  );
};
