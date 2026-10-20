import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { type HeartbeatService } from './heartbeat.service';
import { ProbeServer } from './probe.server';
import { type WorkerEnv } from '../config/env.module';

describe('ProbeServer', () => {
  it('fails start-up when its port is already in use', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
    const { port } = blocker.address() as AddressInfo;
    const probe = new ProbeServer(
      { WORKER_HEALTH_PORT: port } as WorkerEnv,
      { isHealthy: () => true } as unknown as HeartbeatService,
    );
    try {
      await expect(probe.onApplicationBootstrap()).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
