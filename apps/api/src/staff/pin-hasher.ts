import { randomBytes } from 'node:crypto';

import { derivePinPepper, hashPin, verifyPin } from '@radd/db/crypto';

/**
 * Hashes and checks quick-switch PINs with the server's pepper (ADR-026). The pepper is derived
 * once from `BETTER_AUTH_SECRET`; neither it nor any PIN is ever logged.
 */
export class PinHasher {
  private readonly pepper: Buffer;
  /** A real hash of nothing anyone knows, checked when there is no PIN to compare against. */
  private dummy: Promise<string> | undefined;

  constructor(secret: string) {
    this.pepper = derivePinPepper(secret);
  }

  hash(pin: string): Promise<string> {
    return hashPin(pin, this.pepper);
  }

  /**
   * Always runs exactly one argon2id verification: against `stored`, or against a dummy hash when
   * there is nothing to compare (unknown member, no PIN, wrong device), so every failure takes
   * about as long as a wrong PIN and timing reveals nothing. False whenever `stored` is absent.
   */
  async verify(stored: string | null | undefined, pin: string): Promise<boolean> {
    if (stored) return verifyPin(stored, pin, this.pepper);
    this.dummy ??= hashPin(randomBytes(16).toString('hex'), this.pepper);
    await verifyPin(await this.dummy, pin, this.pepper);
    return false;
  }
}
