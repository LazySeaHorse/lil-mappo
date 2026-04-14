import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * POST /api/render-fail
 * Body: { jobId, secret, errorMessage }
 *
 * Called by HeadlessRenderer when an export error occurs. Refunds the exact
 * monthly/purchased credit split recorded at dispatch time, marks the job
 * failed, and invalidates the render secret.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobId, secret, errorMessage } = (req.body ?? {}) as {
    jobId?: string; secret?: string; errorMessage?: string;
  };
  if (!jobId || !secret) return res.status(400).json({ error: 'Missing jobId or secret' });

  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch the job to get user and credit split
  const { data: job, error: fetchError } = await supabase
    .from('render_jobs')
    .select('user_id, monthly_credits_charged, purchased_credits_charged')
    .eq('id', jobId)
    .eq('render_secret_hash', secretHash)
    .maybeSingle();

  if (fetchError || !job) return res.status(404).json({ error: 'Job not found or secret invalid' });

  // Refund credits
  await supabase.rpc('refund_render_credits', {
    p_user_id: job.user_id,
    p_monthly_amount: job.monthly_credits_charged,
    p_purchased_amount: job.purchased_credits_charged,
  });

  // Mark failed and invalidate secret
  const { error: updateError } = await supabase
    .from('render_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage ?? 'Render failed',
      render_secret_hash: null,
    })
    .eq('id', jobId);

  if (updateError) return res.status(500).json({ error: updateError.message });

  return res.status(200).json({ success: true });
}
