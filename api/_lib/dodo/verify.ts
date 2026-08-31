import type { IncomingHttpHeaders } from "node:http";
import type { VercelRequest } from "@vercel/node";
import DodoPayments from "dodopayments";
import type { WebhookEvent } from "./types.js";

/**
 * Reads the incoming HTTP request stream into a raw Buffer.
 * Must be called before any JSON parsing so the HMAC signature can be verified against exact bytes.
 */
export function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Normalizes HTTP headers from string | string[] | undefined to Record<string, string>.
 */
export function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  return normalized;
}

export interface VerifyWebhookOptions {
  apiKey?: string;
  webhookSecret: string;
  environment?: "test_mode" | "live_mode";
}

/**
 * Verifies the HMAC signature of a Dodo webhook payload and unwraps the event object.
 * Throws an error if the signature is invalid.
 */
export function verifyDodoWebhook(
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
  options: VerifyWebhookOptions
): WebhookEvent {
  const dodo = new DodoPayments({
    bearerToken: options.apiKey ?? "",
    environment: options.environment ?? "test_mode",
    webhookKey: options.webhookSecret,
  });

  const normalizedHeaders = normalizeHeaders(headers);
  return dodo.webhooks.unwrap(rawBody.toString(), { headers: normalizedHeaders });
}
