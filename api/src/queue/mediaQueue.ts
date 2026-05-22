import Bull from 'bull';
import { config } from '../config';

export interface MediaJob {
  mediaId: string;
  originalPath: string;
  mediaType: 'photo' | 'video';
  mimeType: string;
}

export const mediaQueue = new Bull<MediaJob>('media-processing', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
