import { buildApp } from './app';
import { config } from './config';

const app = buildApp();

app.listen({ port: config.PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
