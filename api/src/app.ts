import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import eventsRoutes from './routes/events';
import groupsRoutes from './routes/groups';
import mediaRoutes from './routes/media';
import adminRoutes from './routes/admin';
import { config } from './config';

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    trustProxy: true,
  });

  fastify.register(fastifyCookie);
  fastify.register(authPlugin);
  fastify.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      files: 20,
    },
  });

  fastify.register(authRoutes,       { prefix: '/api/v1/auth' });
  fastify.register(categoriesRoutes, { prefix: '/api/v1/categories' });
  fastify.register(eventsRoutes,     { prefix: '/api/v1' });
  fastify.register(groupsRoutes,     { prefix: '/api/v1/groups' });
  fastify.register(mediaRoutes,      { prefix: '/api/v1' });
  fastify.register(adminRoutes,      { prefix: '/api/v1/admin' });

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);
    if (error.name === 'ZodError') {
      return reply.code(400).send({ statusCode: 400, error: 'Validation Error', message: error.message });
    }
    const status = error.statusCode ?? 500;
    return reply.code(status).send({
      statusCode: status,
      error: error.name,
      message: error.message,
    });
  });

  return fastify;
}
