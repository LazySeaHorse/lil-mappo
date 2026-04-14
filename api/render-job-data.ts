import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * GET /api/render-job-data?jobId=<id>&secret=<secret>
 *
 * Called by HeadlessRenderer on page load to fetch the project data and render
 * config for a given job. Secret is verified by hashing and comparing to the
 * stored hash — the plaintext secret is never stored.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { jobId, secret } = req.query as { jobId?: string; secret?: string };
  if (!jobId || !secret) return res.status(400).json({ error: 'Missing jobId or secret' });

  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: job, error } = await supabase
    .from('render_jobs')
    .select('project_data, render_config, duration_sec')
    .eq('id', jobId)
    .eq('render_secret_hash', secretHash)
    .maybeSingle();

  if (error || !job) return res.status(404).json({ error: 'Job not found or secret invalid' });

  return res.status(200).json({
    projectData: job.project_data,
    renderConfig: job.render_config,
    startTime: 0,
    endTime: job.duration_sec ?? (job.render_config as any)?.duration ?? 30,
  });
}
