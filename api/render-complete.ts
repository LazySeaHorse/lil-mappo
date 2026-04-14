import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * POST /api/render-complete
 * Body: { jobId, secret, outputUrl }
 *
 * Called by HeadlessRenderer after successfully uploading the output file.
 * Marks the job as done, sets a 24h expiry on the download link, and
 * invalidates the render secret (one-use).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobId, secret, outputUrl } = (req.body ?? {}) as {
    jobId?: string; secret?: string; outputUrl?: string;
  };
  if (!jobId || !secret || !outputUrl) return res.status(400).json({ error: 'Missing jobId, secret, or outputUrl' });

  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'done',
      output_url: outputUrl,
      expires_at: expiresAt,
      render_secret_hash: null, // invalidate — one-use
    })
    .eq('id', jobId)
    .eq('render_secret_hash', secretHash);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}
