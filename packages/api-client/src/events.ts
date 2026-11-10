import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

/** Every realtime event shares this envelope (API §7). */
export interface EventEnvelope<TType extends string = string, TData = unknown> {
  type: TType;
  at: string;
  /** Present on session events; a gap means the client must resync from REST (ARCH §8). */
  sessionVersion?: number;
  data: TData;
}

/**
 * Server → client events per namespace. Empty until P4-T03 adds the gateway; listing events here
 * keeps emitters and listeners type-checked on both sides.
 */
/* eslint-disable @typescript-eslint/no-generated-empty-object-type -- empty until P4-T03 adds events */
export type DinerServerEvents = Record<never, (event: EventEnvelope) => void>;
export type DinerClientEvents = Record<never, never>;
export type StaffServerEvents = Record<never, (event: EventEnvelope) => void>;
export type StaffClientEvents = Record<never, never>;
/* eslint-enable @typescript-eslint/no-generated-empty-object-type */

export type DinerSocket = Socket<DinerServerEvents, DinerClientEvents>;
export type StaffSocket = Socket<StaffServerEvents, StaffClientEvents>;

type Namespace = '/diner' | '/staff';

function connect(
  baseUrl: string,
  namespace: Namespace,
  options: Partial<ManagerOptions & SocketOptions>,
) {
  return io(new URL(namespace, baseUrl).toString(), {
    withCredentials: true,
    // Polling first keeps the connection alive on networks that block WebSocket upgrades.
    transports: ['polling', 'websocket'],
    autoConnect: false,
    ...options,
  });
}

export function createDinerSocket(
  baseUrl: string,
  options: Partial<ManagerOptions & SocketOptions> = {},
): DinerSocket {
  return connect(baseUrl, '/diner', options);
}

export function createStaffSocket(
  baseUrl: string,
  options: Partial<ManagerOptions & SocketOptions> = {},
): StaffSocket {
  return connect(baseUrl, '/staff', options);
}
