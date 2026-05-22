import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { isPrivateIP } from '../utils/isPrivateIP';

const localOnlyPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const ip =
      (request.headers['x-real-ip'] as string | undefined) ??
      request.socket.remoteAddress ??
      '';

    if (!isPrivateIP(ip)) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Admin access is only available on the local network.',
      });
    }
  });
};

export default fp(localOnlyPlugin, { name: 'localOnly' });
