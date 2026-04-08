import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { GaruSignatureVerificationError, webhooks } from '../src/index.js';

function sign(payload: string, secret: string, timestamp: number): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

describe('webhooks.verify', () => {
  const secret = 'whsec_supersecret';
  const nowSec = 1_800_000_000;
  const now = () => nowSec * 1000;
  const payload = JSON.stringify({ id: 'evt_1', type: 'transaction.payment.succeeded' });

  it('accepts a valid signature and returns the parsed event', () => {
    const signature = sign(payload, secret, nowSec);

    const result = webhooks.verify({ payload, signature, secret, now });

    expect(result.timestamp).toBe(nowSec);
    expect(result.event).toEqual({ id: 'evt_1', type: 'transaction.payment.succeeded' });
  });

  it('accepts a Buffer payload', () => {
    const signature = sign(payload, secret, nowSec);

    const result = webhooks.verify({
      payload: Buffer.from(payload),
      signature,
      secret,
      now
    });

    expect((result.event as { id: string }).id).toBe('evt_1');
  });

  it('rejects when the secret is wrong', () => {
    const signature = sign(payload, 'whsec_different', nowSec);

    expect(() => webhooks.verify({ payload, signature, secret, now })).toThrow(
      GaruSignatureVerificationError
    );
  });

  it('rejects when the payload was tampered', () => {
    const signature = sign(payload, secret, nowSec);

    expect(() =>
      webhooks.verify({
        payload: payload.replace('succeeded', 'failed'),
        signature,
        secret,
        now
      })
    ).toThrow(GaruSignatureVerificationError);
  });

  it('rejects when the signature timestamp is outside the tolerance window', () => {
    const oldTs = nowSec - 1000;
    const signature = sign(payload, secret, oldTs);

    expect(() => webhooks.verify({ payload, signature, secret, now })).toThrow(/tolerance window/);
  });

  it('rejects a malformed signature header', () => {
    expect(() => webhooks.verify({ payload, signature: 'garbage', secret, now })).toThrow(
      GaruSignatureVerificationError
    );
    expect(() => webhooks.verify({ payload, signature: '', secret, now })).toThrow(
      GaruSignatureVerificationError
    );
    expect(() => webhooks.verify({ payload, signature: 't=abc,v1=nothex', secret, now })).toThrow(
      GaruSignatureVerificationError
    );
  });

  it('rejects a valid signature over an invalid JSON payload', () => {
    const bad = '{not json';
    const signature = sign(bad, secret, nowSec);

    expect(() => webhooks.verify({ payload: bad, signature, secret, now })).toThrow(/valid JSON/);
  });
});
