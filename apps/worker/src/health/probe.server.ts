import { createServer, type Server } from 'node:http';

import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { HeartbeatService } from './heartbeat.service';
import { WORKER_ENV, type WorkerEnv } from '../config/env.module';

/**
 * Tiny HTTP probe for Docker and Coolify (DEPLOYMENT §1): `GET /healthz` is 200 while the
 * heartbeat is fresh, 503 otherwise. The worker serves nothing else over HTTP.
 */
@Injectable()
export class ProbeServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server | undefined;

  constructor(
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    private readonly heartbeat: HeartbeatService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== '/healthz') {
        res.writeHead(404).end();
        return;
      }
      const healthy = this.heartbeat.isHealthy();
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          status: healthy ? 'ok' : 'stale',
          lastHeartbeatAt: this.heartbeat.lastBeat ?? null,
        }),
      );
    });
    // A port already in use must fail start-up rather than surface as an uncaught 'error' event.
    const server = this.server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.env.WORKER_HEALTH_PORT, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });
  }

  get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address ? address.port : this.env.WORKER_HEALTH_PORT;
  }

  async onApplicationShutdown(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        resolve();
      });
    });
  }
}
