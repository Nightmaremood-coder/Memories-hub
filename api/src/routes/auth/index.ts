import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { db } from '../../db/client';
import { config } from '../../config';
import { z } from 'zod';

const BCRYPT_ROUNDS = 12;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    const body = z.object({
      username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
      email: z.string().email(),
      password: z.string().min(8),
      display_name: z.string().max(100).optional(),
    }).parse(request.body);

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    try {
      const result = await db.query(
        `INSERT INTO users (username, email, password_hash, display_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, status`,
        [body.username, body.email, passwordHash, body.display_name ?? null]
      );
      return reply.code(201).send({
        id: result.rows[0].id,
        username: result.rows[0].username,
        status: result.rows[0].status,
        message: 'Account created. Awaiting admin approval before you can log in.',
      });
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: err.detail?.includes('email') ? 'Email already in use.' : 'Username already taken.',
        });
      }
      throw err;
    }
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string(),
    }).parse(request.body);

    const result = await db.query(
      `SELECT id, username, email, password_hash, role, status FROM users WHERE email = $1`,
      [body.email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials.' });
    }

    if (user.status === 'pending') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Account is pending admin approval.' });
    }
    if (user.status === 'suspended') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Account has been suspended.' });
    }

    const accessToken = fastify.jwt.sign(
      { id: user.id, role: user.role, status: user.status },
      { expiresIn: config.JWT_ACCESS_EXPIRY }
    );

    const rawRefreshToken = randomBytes(48).toString('hex');
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, request.headers['user-agent'] ?? null, request.socket.remoteAddress]
    );

    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    return reply.code(200).send({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: rawRefreshToken,
      user: { id: user.id, username: user.username, role: user.role, status: user.status },
    });
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const body = z.object({ refresh_token: z.string() }).parse(request.body);
    const tokenHash = hashToken(body.refresh_token);

    const result = await db.query(
      `SELECT rt.id, rt.user_id, u.role, u.status
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked = FALSE
         AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (!result.rows[0]) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired refresh token.' });
    }

    const { id: tokenId, user_id, role, status } = result.rows[0];

    await db.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [tokenId]);

    const rawNewToken = randomBytes(48).toString('hex');
    const newHash = hashToken(rawNewToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user_id, newHash, expiresAt]
    );

    const accessToken = fastify.jwt.sign(
      { id: user_id, role, status },
      { expiresIn: config.JWT_ACCESS_EXPIRY }
    );

    return reply.code(200).send({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: rawNewToken,
    });
  });

  // POST /auth/logout
  fastify.post('/logout', { preHandler: [(fastify as any).authenticate] }, async (request, reply) => {
    const body = z.object({ refresh_token: z.string().optional() }).parse(request.body ?? {});

    if (body.refresh_token) {
      const tokenHash = hashToken(body.refresh_token);
      await db.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, [tokenHash]);
    }

    return reply.code(200).send({ message: 'Logged out successfully.' });
  });

  // GET /auth/me
  fastify.get('/me', { preHandler: [(fastify as any).requireActive] }, async (request, reply) => {
    const { id } = (request as any).user;
    const result = await db.query(
      `SELECT id, username, email, display_name, avatar_url, role, status, created_at, last_login_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
    }
    return result.rows[0];
  });
};

export default authRoutes;
