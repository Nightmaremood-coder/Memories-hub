import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { Writable } from 'stream';

interface VideoResult {
  thumbPath: string;
  videoPath: string;
  width: number;
  height: number;
  durationSecs: number;
}

function probeVideo(input: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function extractFrame(input: string, outPath: string, seekSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .seekInput(seekSeconds)
      .frames(1)
      .output(outPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function transcodeVideo(input: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilter('scale=-2:720')
      .videoCodec('libx264')
      .outputOptions(['-crf 28', '-preset fast', '-movflags +faststart'])
      .audioCodec('aac')
      .audioBitrate('128k')
      .output(outPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

export async function processVideo(
  originalPath: string,
  mediaId: string,
  mediaBasePath: string
): Promise<VideoResult> {
  const renditionsDir = join(mediaBasePath, 'renditions', mediaId);
  await mkdir(renditionsDir, { recursive: true });

  const probe = await probeVideo(originalPath);
  const videoStream = probe.streams.find((s) => s.codec_type === 'video');
  const width = videoStream?.width ?? 0;
  const height = videoStream?.height ?? 0;
  const durationSecs = parseFloat(String(probe.format.duration ?? 0));

  const thumbRelPath = `renditions/${mediaId}/thumb_256.webp`;
  const videoRelPath = `renditions/${mediaId}/video_720p.mp4`;
  const thumbAbsPath = join(mediaBasePath, thumbRelPath);
  const videoAbsPath = join(mediaBasePath, videoRelPath);

  const seekAt = Math.min(1, durationSecs * 0.1);
  const tempFramePath = join(renditionsDir, '_frame.jpg');
  await extractFrame(originalPath, tempFramePath, seekAt);

  await sharp(tempFramePath)
    .resize(256, 256, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(thumbAbsPath);

  const { unlink } = await import('fs/promises');
  await unlink(tempFramePath).catch(() => {});

  await transcodeVideo(originalPath, videoAbsPath);

  return {
    thumbPath: thumbRelPath,
    videoPath: videoRelPath,
    width,
    height,
    durationSecs,
  };
}
