import { Redis } from 'ioredis';

export const WORKER_VALKEY = Symbol('WORKER_VALKEY');

/** BullMQ workers block on Valkey and require `maxRetriesPerRequest: null`. */
export function createWorkerConnection(url: string, name: string): Redis {
  return new Redis(url, { connectionName: name, maxRetriesPerRequest: null });
}
