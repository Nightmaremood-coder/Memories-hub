import Bull from 'bull';
import { Pool } from 'pg';
import { processImage } from './processors/image.processor';
import { processVideo } from './processors/video.processor';

interface MediaJob {
  mediaId: string;
  originalPath: string;
  mediaType: 'photo' | 'video';
  mimeType: string;
}

const DATABASE_URL = process.env.DATABASE_URL!;
const REDIS_URL = process.env.REDIS_URL!;
const MEDIA_BASE_PATH = process.env.MEDIA_BASE_PATH || '/mnt/media';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);

const db = new Pool({ connectionString: DATABASE_URL, max: 5 });

const queue = new Bull<MediaJob>('media-processing', {
  redis: REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

queue.process(CONCURRENCY, async (job) => {
  const { mediaId, originalPath, mediaType } = job.data;
  console.log(`[worker] Processing ${mediaType} ${mediaId}`);

  await db.query(`UPDATE media SET status = 'processing' WHERE id = $1`, [mediaId]);

  try {
    if (mediaType === 'video') {
      const result = await processVideo(originalPath, mediaId, MEDIA_BASE_PATH);
      await db.query(
        `UPDATE media SET
           status = 'ready',
           thumb_path = $1,
           video_path = $2,
           width = $3,
           height = $4,
           duration_secs = $5
         WHERE id = $6`,
        [result.thumbPath, result.videoPath, result.width, result.height, result.durationSecs, mediaId]
      );
    } else {
      const result = await processImage(originalPath, mediaId, MEDIA_BASE_PATH);
      await db.query(
        `UPDATE media SET
           status = 'ready',
           thumb_path = $1,
           preview_path = $2,
           width = $3,
           height = $4,
           taken_at = $5,
           camera_make = $6,
           camera_model = $7,
           gps_lat = $8,
           gps_lng = $9
         WHERE id = $10`,
        [
          result.thumbPath, result.previewPath,
          result.width, result.height,
          result.takenAt, result.cameraMake, result.cameraModel,
          result.gpsLat, result.gpsLng,
          mediaId,
        ]
      );
    }
    console.log(`[worker] Done ${mediaId}`);
  } catch (err: any) {
    console.error(`[worker] Error processing ${mediaId}:`, err.message);
    await db.query(
      `UPDATE media SET error_message = $1, retry_count = retry_count + 1 WHERE id = $2`,
      [err.message, mediaId]
    );
    throw err;
  }
});

queue.on('failed', async (job, err) => {
  if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
    await db.query(
      `UPDATE media SET status = 'failed', error_message = $1 WHERE id = $2`,
      [err.message, job.data.mediaId]
    );
    console.error(`[worker] Permanently failed ${job.data.mediaId}: ${err.message}`);
  }
});

console.log(`[worker] Started with concurrency ${CONCURRENCY}`);
