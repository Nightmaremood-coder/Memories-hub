import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client';
import { z } from 'zod';

async function canViewEvent(userId: string, eventId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM events e
     WHERE e.id = $1 AND (
       e.is_public = TRUE
       OR e.creator_id = $2
       OR EXISTS (
         SELECT 1 FROM event_permissions ep
         WHERE ep.event_id = e.id
           AND ep.target_type = 'user'
           AND ep.target_id = $2
       )
       OR EXISTS (
         SELECT 1 FROM event_permissions ep
         JOIN group_members gm ON gm.group_id = ep.target_id
         WHERE ep.event_id = e.id
           AND ep.target_type = 'group'
           AND gm.user_id = $2
       )
     )`,
    [eventId, userId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  const preHandler = [(fastify as any).requireActive];

  // GET /categories/:catId/events
  fastify.get<{ Params: { catId: string } }>('/categories/:catId/events', { preHandler }, async (request) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(
      `SELECT e.*, COUNT(m.id)::int AS media_count
       FROM events e
       LEFT JOIN media m ON m.event_id = e.id
       WHERE e.category_id = $1 AND (
         e.is_public = TRUE
         OR e.creator_id = $2
         OR $3 = 'admin'
         OR EXISTS (
           SELECT 1 FROM event_permissions ep
           WHERE ep.event_id = e.id AND ep.target_type = 'user' AND ep.target_id = $2
         )
         OR EXISTS (
           SELECT 1 FROM event_permissions ep
           JOIN group_members gm ON gm.group_id = ep.target_id
           WHERE ep.event_id = e.id AND ep.target_type = 'group' AND gm.user_id = $2
         )
       )
       GROUP BY e.id
       ORDER BY e.event_date DESC NULLS LAST, e.created_at DESC`,
      [request.params.catId, userId, role]
    );
    return result.rows;
  });

  // POST /categories/:catId/events
  fastify.post<{ Params: { catId: string } }>('/categories/:catId/events', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      location_name: z.string().max(255).optional(),
      is_public: z.boolean().default(false),
    }).parse(request.body);

    const catCheck = await db.query(`SELECT id FROM categories WHERE id = $1`, [request.params.catId]);
    if (!catCheck.rows[0]) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Category not found.' });
    }

    const result = await db.query(
      `INSERT INTO events (category_id, creator_id, title, description, event_date, location_name, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [request.params.catId, userId, body.title, body.description ?? null,
       body.event_date ?? null, body.location_name ?? null, body.is_public]
    );
    return reply.code(201).send(result.rows[0]);
  });

  // GET /events/:id
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    if (role !== 'admin' && !(await canViewEvent(userId, request.params.id))) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied to this event.' });
    }
    const result = await db.query(
      `SELECT e.*, COUNT(m.id)::int AS media_count
       FROM events e
       LEFT JOIN media m ON m.event_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [request.params.id]
    );
    if (!result.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
    return result.rows[0];
  });

  // PATCH /events/:id
  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const body = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional(),
      event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      location_name: z.string().max(255).optional(),
      is_public: z.boolean().optional(),
    }).parse(request.body);

    const existing = await db.query(`SELECT creator_id FROM events WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
    if (existing.rows[0].creator_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }

    const result = await db.query(
      `UPDATE events SET
         title         = COALESCE($1, title),
         description   = COALESCE($2, description),
         event_date    = COALESCE($3, event_date),
         location_name = COALESCE($4, location_name),
         is_public     = COALESCE($5, is_public)
       WHERE id = $6
       RETURNING *`,
      [body.title ?? null, body.description ?? null, body.event_date ?? null,
       body.location_name ?? null, body.is_public ?? null, request.params.id]
    );
    return result.rows[0];
  });

  // DELETE /events/:id
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const existing = await db.query(`SELECT creator_id FROM events WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
    if (existing.rows[0].creator_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    await db.query(`DELETE FROM events WHERE id = $1`, [request.params.id]);
    return reply.code(204).send();
  });

  // GET /events/:id/permissions
  fastify.get<{ Params: { id: string } }>('/:id/permissions', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const existing = await db.query(`SELECT creator_id FROM events WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
    if (existing.rows[0].creator_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    const result = await db.query(
      `SELECT * FROM event_permissions WHERE event_id = $1 ORDER BY granted_at DESC`,
      [request.params.id]
    );
    return result.rows;
  });

  // POST /events/:id/permissions
  fastify.post<{ Params: { id: string } }>('/:id/permissions', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const body = z.object({
      target_type: z.enum(['user', 'group']),
      target_id: z.string().uuid(),
    }).parse(request.body);

    const existing = await db.query(`SELECT creator_id FROM events WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
    if (existing.rows[0].creator_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }

    try {
      const result = await db.query(
        `INSERT INTO event_permissions (event_id, target_type, target_id, granted_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [request.params.id, body.target_type, body.target_id, userId]
      );
      return reply.code(201).send(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Permission already exists.' });
      }
      throw err;
    }
  });

  // DELETE /events/:id/permissions/:permId
  fastify.delete<{ Params: { id: string; permId: string } }>('/:id/permissions/:permId', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const existing = await db.query(`SELECT creator_id FROM events WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Event not found.' });
    if (existing.rows[0].creator_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    await db.query(
      `DELETE FROM event_permissions WHERE id = $1 AND event_id = $2`,
      [request.params.permId, request.params.id]
    );
    return reply.code(204).send();
  });
};

export default eventsRoutes;
