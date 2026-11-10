import { describe, expect, it } from 'vitest';

import config from '../next.config';

describe('Next config', () => {
  it('renders no trace meta tags, which would reveal the sampling decision (ADR-019)', () => {
    expect(config.experimental.clientTraceMetadata).toEqual([]);
  });
});
