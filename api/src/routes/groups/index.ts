import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client';
import { z } from 'zod';

const groupsRoutes: FastifyPluginAsync = async (fastify) => {
  const preHandler = [(fastify as any).requireActive];

  // GET /groups
  fastify.get('/', { preHandler }, async (request) => {
    const { id: userId } = (request as any).user;
    const result = await db.query(
      `SELECT g.*, COUNT(gm.user_id)::int AS member_count
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       WHERE g.owner_id = $1
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [userId]
    );
    return result.rows;
  });

  // POST /groups
  fastify.post('/', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    }).parse(request.body);

    try {
      const result = await db.query(
        `INSERT INTO groups (owner_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
        [userId, body.name, body.description ?? null]
      );
      return reply.code(201).send(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'A group with that name already exists.' });
      }
      throw err;
    }
  });

  // GET /groups/:id
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const group = await db.query(`SELECT * FROM groups WHERE id = $1`, [request.params.id]);
    if (!group.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found.' });
    if (group.rows[0].owner_id !== userId) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    const members = await db.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [request.params.id]
    );
    return { ...group.rows[0], members: members.rows };
  });

  // PATCH /groups/:id
  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = z.object({ name: z.string().min(1).max(100).optional() }).parse(request.body);
    const existing = await db.query(`SELECT owner_id FROM groups WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found.' });
    if (existing.rows[0].owner_id !== userId) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    const result = await db.query(
      `UPDATE groups SET name = COALESCE($1, name) WHERE id = $2 RETURNING *`,
      [body.name ?? null, request.params.id]
    );
    return result.rows[0];
  });

  // DELETE /groups/:id
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const existing = await db.query(`SELECT owner_id FROM groups WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found.' });
    if (existing.rows[0].owner_id !== userId) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    await db.query(`DELETE FROM groups WHERE id = $1`, [request.params.id]);
    return reply.code(204).send();
  });

  // POST /groups/:id/members
  fastify.post<{ Params: { id: string } }>('/:id/members', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = z.object({ user_id: z.string().uuid() }).parse(request.body);
    const existing = await db.query(`SELECT owner_id FROM groups WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found.' });
    if (existing.rows[0].owner_id !== userId) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    try {
      await db.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
        [request.params.id, body.user_id]
      );
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'User is already in this group.' });
      }
      throw err;
    }
    return reply.code(201).send({ message: 'Member added.' });
  });

  // DELETE /groups/:id/members/:userId
  fastify.delete<{ Params: { id: string; userId: string } }>('/:id/members/:userId', { preHandler }, async (request, reply) => {
    const { id: ownerId } = (request as any).user;
    const existing = await db.query(`SELECT owner_id FROM groups WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Group not found.' });
    if (existing.rows[0].owner_id !== ownerId) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    await db.query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [request.params.id, request.params.userId]
    );
    return reply.code(204).send();
  });
};

export default groupsRoutes;
