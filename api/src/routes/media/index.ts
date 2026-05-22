import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client';
import { mediaQueue } from '../../queue/mediaQueue';
import { config } from '../../config';
import { createWriteStream, existsSync } from 'fs';
import { mkdir, unlink, rm } from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { z } from 'zod';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif',
  '.heic', '.heif', '.dng', '.raw', '.cr2', '.cr3', '.nef', '.arw',
  '.raf', '.orf', '.rw2', '.pef', '.srw',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp', '.mts',
]);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp', '.mts']);

async function hasEventAccess(userId: string, eventId: string, role: string): Promise<boolean> {
  if (role === 'admin') return true;
  const result = await db.query(
    `SELECT 1 FROM events e
     WHERE e.id = $1 AND (
       e.is_public = TRUE OR e.creator_id = $2
       OR EXISTS (
         SELECT 1 FROM event_permissions ep
         WHERE ep.event_id = e.id AND ep.target_type = 'user' AND ep.target_id = $2
       )
       OR EXISTS (
         SELECT 1 FROM event_permissions ep
         JOIN group_members gm ON gm.group_id = ep.target_id
         WHERE ep.event_id = e.id AND ep.target_type = 'group' AND gm.user_id = $2
       )
     )`,
    [eventId, userId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  const preHandler = [(fastify as any).requireActive];

  // GET /events/:eventId/media
  fastify.get<{ Params: { eventId: string }; Querystring: { page?: number; limit?: number } }>(
    '/events/:eventId/media', { preHandler }, async (request, reply) => {
      const { id: userId, role } = (request as any).user;
      if (!(await hasEventAccess(userId, request.params.eventId, role))) {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
      }
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
      const offset = (page - 1) * limit;

      const result = await db.query(
        `SELECT id, media_type, status, original_filename, thumb_path, preview_path,
                video_path, width, height, duration_secs, taken_at, camera_make,
                camera_model, gps_lat, gps_lng, original_size_bytes, created_at
         FROM media
         WHERE event_id = $1
         ORDER BY taken_at DESC NULLS LAST, created_at DESC
         LIMIT $2 OFFSET $3`,
        [request.params.eventId, limit, offset]
      );

      const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM media WHERE event_id = $1`, [request.params.eventId]);
      return { data: result.rows, total: countResult.rows[0].total, page, limit };
    }
  );

  // POST /events/:eventId/media  (upload)
  fastify.post<{ Params: { eventId: string } }>(
    '/events/:eventId/media', { preHandler }, async (request, reply) => {
      const { id: userId, role } = (request as any).user;
      if (!(await hasEventAccess(userId, request.params.eventId, role))) {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
      }

      const maxBytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
      const uploaded: object[] = [];

      const parts = (request as any).files({ limits: { fileSize: maxBytes } });

      for await (const part of parts) {
        const ext = extname(part.filename).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          await part.file.resume();
          return reply.code(400).send({
            statusCode: 400, error: 'Bad Request',
            message: `File type '${ext}' is not supported.`,
          });
        }

        const mediaType = VIDEO_EXTENSIONS.has(ext) ? 'video' : 'photo';
        const uuid = randomUUID();
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const relDir = `originals/${year}/${month}`;
        const absDir = join(config.MEDIA_BASE_PATH, relDir);
        const relPath = `${relDir}/${uuid}${ext}`;
        const absPath = join(config.MEDIA_BASE_PATH, relPath);

        await mkdir(absDir, { recursive: true });

        try {
          await pipeline(part.file, createWriteStream(absPath));
        } catch {
          return reply.code(413).send({ statusCode: 413, error: 'Payload Too Large', message: 'File exceeds size limit.' });
        }

        const fileSize = statSync(absPath).size;

        const dbResult = await db.query(
          `INSERT INTO media (event_id, uploader_id, media_type, original_filename, original_path, original_size_bytes, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, original_filename, status`,
          [request.params.eventId, userId, mediaType, part.filename, relPath, fileSize, part.mimetype]
        );
        const row = dbResult.rows[0];

        await mediaQueue.add({ mediaId: row.id, originalPath: absPath, mediaType, mimeType: part.mimetype });

        uploaded.push({ id: row.id, original_filename: row.original_filename, status: row.status });
      }

      return reply.code(202).send({ uploaded });
    }
  );

  // GET /media/:id
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(`SELECT * FROM media WHERE id = $1`, [request.params.id]);
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
    if (!(await hasEventAccess(userId, media.event_id, role))) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    return media;
  });

  // GET /media/:id/original  (download full quality)
  fastify.get<{ Params: { id: string } }>('/:id/original', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(`SELECT * FROM media WHERE id = $1`, [request.params.id]);
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
    if (!(await hasEventAccess(userId, media.event_id, role))) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }

    const absPath = join(config.MEDIA_BASE_PATH, media.original_path);
    if (!existsSync(absPath)) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'File not found on disk.' });
    }

    const stat = statSync(absPath);
    reply.header('Content-Length', stat.size);
    reply.header('Content-Disposition', `attachment; filename="${basename(media.original_filename)}"`);
    reply.header('Content-Type', media.mime_type || 'application/octet-stream');
    return reply.send(createReadStream(absPath));
  });

  function streamRendition(absPath: string, contentType: string, reply: any) {
    if (!existsSync(absPath)) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Rendition not ready yet.' });
    }
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(createReadStream(absPath));
  }

  // GET /media/:id/thumb
  fastify.get<{ Params: { id: string } }>('/:id/thumb', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(`SELECT event_id, thumb_path FROM media WHERE id = $1`, [request.params.id]);
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
    if (!(await hasEventAccess(userId, media.event_id, role))) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    if (!media.thumb_path) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Thumbnail not ready.' });
    return streamRendition(join(config.MEDIA_BASE_PATH, media.thumb_path), 'image/webp', reply);
  });

  // GET /media/:id/preview
  fastify.get<{ Params: { id: string } }>('/:id/preview', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(`SELECT event_id, preview_path FROM media WHERE id = $1`, [request.params.id]);
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
    if (!(await hasEventAccess(userId, media.event_id, role))) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    if (!media.preview_path) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Preview not ready.' });
    return streamRendition(join(config.MEDIA_BASE_PATH, media.preview_path), 'image/webp', reply);
  });

  // GET /media/:id/video
  fastify.get<{ Params: { id: string } }>('/:id/video', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(`SELECT event_id, video_path FROM media WHERE id = $1`, [request.params.id]);
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
    if (!(await hasEventAccess(userId, media.event_id, role))) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    if (!media.video_path) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Video rendition not ready.' });
    return streamRendition(join(config.MEDIA_BASE_PATH, media.video_path), 'video/mp4', reply);
  });

  // DELETE /media/:id
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(`SELECT * FROM media WHERE id = $1`, [request.params.id]);
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Media not found.' });
    if (media.uploader_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }

    await db.query(`DELETE FROM media WHERE id = $1`, [request.params.id]);

    const originalAbs = join(config.MEDIA_BASE_PATH, media.original_path);
    if (existsSync(originalAbs)) await unlink(originalAbs).catch(() => {});

    const renditionsDir = join(config.MEDIA_BASE_PATH, 'renditions', media.id);
    if (existsSync(renditionsDir)) await rm(renditionsDir, { recursive: true, force: true }).catch(() => {});

    return reply.code(204).send();
  });
};

export default mediaRoutes;
