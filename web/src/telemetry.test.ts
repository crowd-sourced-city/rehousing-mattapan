import { describe, expect, it } from 'vitest';
import { scrubUrl } from './telemetry';

describe('scrubUrl: the lot ID never leaves the browser', () => {
  it.each([
    ['https://x.io/a/#/find?p=0123456789', 'https://x.io/a/#/find'],
    ['https://x.io/a/#/find?p=0123456789&q=1', 'https://x.io/a/#/find?q=1'],
    ['https://x.io/a/#/find?q=1&p=0123456789', 'https://x.io/a/#/find?q=1'],
    ['https://x.io/a/?study=P07#/find?p=0123456789', 'https://x.io/a/?study=P07#/find'],
    ['https://x.io/a/#/options', 'https://x.io/a/#/options'],
  ])('%s', (input, out) => expect(scrubUrl(input)).toBe(out));
});
