import sharp from 'sharp';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { parse } from 'exifr';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';

const execFileAsync = promisify(execFile);

const RAW_EXTENSIONS = new Set(['.dng', '.raw', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2', '.pef', '.srw']);

interface ImageResult {
  thumbPath: string;
  previewPath: string;
  width: number;
  height: number;
  takenAt: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
}

export async function processImage(
  originalPath: string,
  mediaId: string,
  mediaBasePath: string
): Promise<ImageResult> {
  const ext = originalPath.substring(originalPath.lastIndexOf('.')).toLowerCase();
  const renditionsDir = join(mediaBasePath, 'renditions', mediaId);
  await mkdir(renditionsDir, { recursive: true });

  let workPath = originalPath;
  let tempTiff: string | null = null;

  if (RAW_EXTENSIONS.has(ext)) {
    tempTiff = join(renditionsDir, `_raw_temp.tiff`);
    await execFileAsync('dcraw', ['-T', '-w', '-o', '1', '-4', '-q', '3', originalPath]);
    const dcrawOutput = originalPath.replace(ext, '.tiff');
    if (existsSync(dcrawOutput)) {
      workPath = dcrawOutput;
      tempTiff = dcrawOutput;
    } else {
      throw new Error(`dcraw did not produce a TIFF for ${originalPath}`);
    }
  }

  const image = sharp(workPath);
  const meta = await image.metadata();

  const thumbRelPath = `renditions/${mediaId}/thumb_256.webp`;
  const previewRelPath = `renditions/${mediaId}/preview_1080.webp`;
  const thumbAbsPath = join(mediaBasePath, thumbRelPath);
  const previewAbsPath = join(mediaBasePath, previewRelPath);

  await sharp(workPath)
    .rotate()
    .resize(256, 256, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(thumbAbsPath);

  await sharp(workPath)
    .rotate()
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(previewAbsPath);

  let exifData: any = {};
  try {
    exifData = await parse(workPath, {
      pick: ['DateTimeOriginal', 'Make', 'Model', 'latitude', 'longitude'],
    }) ?? {};
  } catch {
    // EXIF extraction is best-effort
  }

  if (tempTiff && existsSync(tempTiff)) {
    await unlink(tempTiff).catch(() => {});
  }

  return {
    thumbPath: thumbRelPath,
    previewPath: previewRelPath,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    takenAt: exifData.DateTimeOriginal ? new Date(exifData.DateTimeOriginal) : null,
    cameraMake: exifData.Make ?? null,
    cameraModel: exifData.Model ?? null,
    gpsLat: exifData.latitude ?? null,
    gpsLng: exifData.longitude ?? null,
  };
}
