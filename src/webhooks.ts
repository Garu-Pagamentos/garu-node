import { createHmac, timingSafeEqual } from 'node:crypto';

import { GaruSignatureVerificationError } from './errors.js';

export interface VerifyWebhookParams {
  /** Raw request body as received — do NOT re-serialize parsed JSON. */
  payload: string | Buffer;
  /** Value of the `X-Garu-Signature` header. Format: `t=<ts>,v1=<hex>`. */
  signature: string;
  /** The webhook endpoint's signing secret. */
  secret: string;
  /** Reject signatures older than this many seconds. Default: 300 (5 min). */
  toleranceSec?: number;
  /** Injectable for tests. Defaults to `Date.now()`. */
  now?: () => number;
}

export interface VerifiedWebhook {
  /** Timestamp from the signature header, in seconds since epoch. */
  timestamp: number;
  /** Parsed JSON body. Throws {@link GaruSignatureVerificationError} if invalid JSON. */
  event: unknown;
}

/**
 * Webhook helpers.
 *
 * Garu signs outgoing webhooks with HMAC-SHA256 over `${timestamp}.${payload}`
 * and delivers the signature in the `X-Garu-Signature` header as `t=<ts>,v1=<hex>`.
 * This matches the format in the backend's `webhook-delivery.service.ts`.
 *
 * @example
 * // Express example
 * app.post('/webhooks/garu', express.raw({ type: 'application/json' }), (req, res) => {
 *   try {
 *     const { event } = Garu.webhooks.verify({
 *       payload: req.body,
 *       signature: req.header('x-garu-signature') ?? '',
 *       secret: process.env.GARU_WEBHOOK_SECRET!
 *     });
 *     // handle event
 *     res.sendStatus(200);
 *   } catch (err) {
 *     res.sendStatus(400);
 *   }
 * });
 */
export const webhooks = {
  verify(params: VerifyWebhookParams): VerifiedWebhook {
    const { signature, secret, payload } = params;
    const toleranceSec = params.toleranceSec ?? 300;
    const now = params.now ?? Date.now;

    if (!signature || typeof signature !== 'string') {
      throw new GaruSignatureVerificationError('Missing or malformed X-Garu-Signature header');
    }

    const parts = parseSignatureHeader(signature);
    if (parts === null) {
      throw new GaruSignatureVerificationError(
        'X-Garu-Signature header does not match expected format t=<ts>,v1=<hex>'
      );
    }

    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');
    const signedPayload = `${parts.timestamp}.${payloadStr}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(parts.v1, 'hex');
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new GaruSignatureVerificationError('Signature does not match computed HMAC');
    }

    const nowSec = Math.floor(now() / 1000);
    if (Math.abs(nowSec - parts.timestamp) > toleranceSec) {
      throw new GaruSignatureVerificationError(
        `Signature timestamp outside tolerance window (${toleranceSec}s)`
      );
    }

    let event: unknown;
    try {
      event = JSON.parse(payloadStr);
    } catch {
      throw new GaruSignatureVerificationError('Webhook payload is not valid JSON');
    }

    return { timestamp: parts.timestamp, event };
  }
};

function parseSignatureHeader(header: string): { timestamp: number; v1: string } | null {
  const fields: Record<string, string> = {};
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) return null;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key || !value) return null;
    fields[key] = value;
  }
  const t = fields.t;
  const v1 = fields.v1;
  if (!t || !v1) return null;
  const timestamp = Number(t);
  if (!Number.isFinite(timestamp) || !/^[a-f0-9]+$/i.test(v1)) return null;
  return { timestamp, v1 };
}
