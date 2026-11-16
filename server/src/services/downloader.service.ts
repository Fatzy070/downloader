import { createSnapchatDownloadStream } from '../adapters/snapchat.adapter.js';
import { createMediaDownloadStream } from '../adapters/ytdlp.adapter.js';
import type { DownloadOptionId, DownloadStreamHandle } from '../types/downloader.js';
import { verifyNetworkSafetyAndRedirects } from '../validators/download.validator.js';

export interface InitiateDownloadParams {
  url: string;
  option: DownloadOptionId;
  title?: string;
}

export async function initiateMediaDownload(
  params: InitiateDownloadParams
): Promise<DownloadStreamHandle> {
  const validated = await verifyNetworkSafetyAndRedirects(params.url);

  const handle =
    validated.platform === 'snapchat'
      ? await createSnapchatDownloadStream(validated.url, params.option)
      : await createMediaDownloadStream(
          validated.url,
          params.option,
          validated.platform
        );

  return {
    ...handle,
    suggestedTitle: params.title || `${validated.platform}-video`,
  };
}
