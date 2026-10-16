import 'dotenv/config';
import { createApp } from './app';
const host = process.env.HOST ?? '127.0.0.1';
if (host !== '127.0.0.1') throw new Error('This local-only MVP must bind to 127.0.0.1');
const { app } = createApp();
await app.listen({ host, port: Number(process.env.PORT ?? 4318) });
console.log(
  `Motivative API ready at ${app.server.address() && `http://${host}:${process.env.PORT ?? 4318}`}`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
