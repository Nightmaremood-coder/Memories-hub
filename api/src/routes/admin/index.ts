import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client';
import localOnlyPlugin from '../../plugins/localOnly';
import { statfsSync } from 'fs';
import { config } from '../../config';
import { z } from 'zod';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.register(localOnlyPlugin);
  const preHandler = [(fastify as any).requireAdmin];

  // GET /admin/users
  fastify.get<{ Querystring: { status?: string; page?: number; limit?: number } }>(
    '/users', { preHandler }, async (request) => {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
      const offset = (page - 1) * limit;
      const statusFilter = request.query.status;

      const whereParts: string[] = [];
      const params: any[] = [];

      if (statusFilter) {
        params.push(statusFilter);
        whereParts.push(`status = $${params.length}`);
      }

      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      const result = await db.query(
        `SELECT id, username, email, display_name, role, status, created_at, last_login_at
         FROM users ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS total FROM users ${where}`,
        params
      );
      return { data: result.rows, total: countResult.rows[0].total, page, limit };
    }
  );

  // PATCH /admin/users/:id/status
  fastify.patch<{ Params: { id: string } }>('/users/:id/status', { preHandler }, async (request, reply) => {
    const adminId = (request as any).user.id;
    const body = z.object({ status: z.enum(['active', 'suspended', 'pending']) }).parse(request.body);

    const result = await db.query(
      `UPDATE users SET status = $1 WHERE id = $2 RETURNING id, username, status`,
      [body.status, request.params.id]
    );
    if (!result.rows[0]) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
    }

    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, 'user', $3, $4)`,
      [adminId, `set_status_${body.status}`, request.params.id, JSON.stringify({ new_status: body.status })]
    );

    return result.rows[0];
  });

  // DELETE /admin/users/:id
  fastify.delete<{ Params: { id: string } }>('/users/:id', { preHandler }, async (request, reply) => {
    const adminId = (request as any).user.id;
    const existing = await db.query(`SELECT id, username FROM users WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });

    await db.query(`DELETE FROM users WHERE id = $1`, [request.params.id]);

    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, metadata)
       VALUES ($1, 'delete_user', 'user', $2, $3)`,
      [adminId, request.params.id, JSON.stringify({ username: existing.rows[0].username })]
    );

    return reply.code(204).send();
  });

  // GET /admin/stats
  fastify.get('/stats', { preHandler }, async (_request, reply) => {
    const [userStats, mediaStats] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
        FROM users
      `),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE media_type = 'photo')::int AS total_photos,
          COUNT(*) FILTER (WHERE media_type = 'video')::int AS total_videos,
          (SELECT COUNT(*)::int FROM events) AS total_events,
          (SELECT COUNT(*)::int FROM categories) AS total_categories
        FROM media
        WHERE status = 'ready'
      `),
    ]);

    let storage = { used_bytes: 0, available_bytes: 0, total_bytes: 0 };
    try {
      const vfs = statfsSync(config.MEDIA_BASE_PATH);
      const blockSize = vfs.bsize;
      const total = vfs.blocks * blockSize;
      const available = vfs.bavail * blockSize;
      const used = total - available;
      storage = { used_bytes: used, available_bytes: available, total_bytes: total };
    } catch {
      // media path may not be mounted in dev
    }

    return reply.send({
      users: userStats.rows[0],
      media: mediaStats.rows[0],
      storage,
    });
  });
};

export default adminRoutes;
