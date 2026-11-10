import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT = 'radd:idempotent';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';

/**
 * Marks a mutation that must carry an `Idempotency-Key` (UUID) header (API §1, CLAUDE §3.6).
 * Repeating the key with the same request returns the first response; with a different request,
 * 422 IDEMPOTENCY_MISMATCH. See ADR-015.
 */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT, true);
