import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client';
import { z } from 'zod';

const categoriesRoutes: FastifyPluginAsync = async (fastify) => {
  const preHandler = [(fastify as any).requireActive];

  // GET /categories
  fastify.get('/', { preHandler }, async (request) => {
    const { id: userId } = (request as any).user;
    const result = await db.query(
      `SELECT c.*, COUNT(e.id)::int AS event_count
       FROM categories c
       LEFT JOIN events e ON e.category_id = c.id
       WHERE c.owner_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [userId]
    );
    return result.rows;
  });

  // POST /categories
  fastify.post('/', { preHandler }, async (request, reply) => {
    const { id: userId } = (request as any).user;
    const body = z.object({
      name: z.string().min(1).max(150),
      description: z.string().max(1000).optional(),
    }).parse(request.body);

    const result = await db.query(
      `INSERT INTO categories (owner_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, body.name, body.description ?? null]
    );
    return reply.code(201).send(result.rows[0]);
  });

  // GET /categories/:id
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const result = await db.query(
      `SELECT c.*, COUNT(e.id)::int AS event_count
       FROM categories c
       LEFT JOIN events e ON e.category_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [request.params.id]
    );
    const cat = result.rows[0];
    if (!cat) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Category not found.' });
    if (cat.owner_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    return cat;
  });

  // PATCH /categories/:id
  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const body = z.object({
      name: z.string().min(1).max(150).optional(),
      description: z.string().max(1000).optional(),
    }).parse(request.body);

    const existing = await db.query(`SELECT owner_id FROM categories WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Category not found.' });
    if (existing.rows[0].owner_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }

    const result = await db.query(
      `UPDATE categories SET
         name        = COALESCE($1, name),
         description = COALESCE($2, description)
       WHERE id = $3
       RETURNING *`,
      [body.name ?? null, body.description ?? null, request.params.id]
    );
    return result.rows[0];
  });

  // DELETE /categories/:id
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const { id: userId, role } = (request as any).user;
    const existing = await db.query(`SELECT owner_id FROM categories WHERE id = $1`, [request.params.id]);
    if (!existing.rows[0]) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Category not found.' });
    if (existing.rows[0].owner_id !== userId && role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied.' });
    }
    await db.query(`DELETE FROM categories WHERE id = $1`, [request.params.id]);
    return reply.code(204).send();
  });
};

export default categoriesRoutes;
