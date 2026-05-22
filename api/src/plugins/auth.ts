import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: { expiresIn: config.JWT_ACCESS_EXPIRY },
  });

  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token.' });
    }
  });

  fastify.decorate('requireActive', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token.' });
    }
    if (request.user.status !== 'active') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Account is not active.' });
    }
  });

  fastify.decorate('requireAdmin', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token.' });
    }
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Admin access required.' });
    }
  });
};

export default fp(authPlugin, { name: 'auth' });
