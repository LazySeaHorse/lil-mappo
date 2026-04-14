import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { calculateRenderCredits } from '../src/types/render';
import type { ExportResolution } from '../src/types/render';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const supabaseUser = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  const { projectData, renderConfig, startTime = 0, endTime } = (req.body ?? {}) as {
    projectData: Record<string, unknown>;
    renderConfig: { exportResolution: ExportResolution; fps: 30 | 60; aspectRatio: string; isVertical: boolean; [k: string]: unknown };
    startTime?: number;
    endTime?: number;
  };

  if (!projectData || !renderConfig) return res.status(400).json({ error: 'Missing projectData or renderConfig' });

  const durationSec = (endTime ?? (projectData.duration as number ?? 30)) - startTime;

  // ── 3. Credit deduction ───────────────────────────────────────────────────────
  const totalCredits = calculateRenderCredits(renderConfig.exportResolution, durationSec, renderConfig.fps);

  const { data: creditResult, error: creditError } = await supabase.rpc('deduct_render_credits', {
    p_user_id: user.id,
    p_total_credits: totalCredits,
  });

  if (creditError) {
    const msg = creditError.message?.includes('Insufficient') ? 'Insufficient credits' : creditError.message;
    return res.status(402).json({ error: msg });
  }

  const [{ monthly_charged, purchased_charged }] = creditResult as { monthly_charged: number; purchased_charged: number }[];

  // ── 4. Generate render secret ─────────────────────────────────────────────────
  const renderSecret = crypto.randomBytes(32).toString('hex');
  const renderSecretHash = crypto.createHash('sha256').update(renderSecret).digest('hex');

  // ── 5. Atomically check parallel limit and insert render_jobs row ─────────────
  // create_render_job acquires a per-user advisory lock in Postgres, so the
  // count check and insert are never interleaved by concurrent requests.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_render_job', {
    p_user_id: user.id,
    p_fps: renderConfig.fps,
    p_duration_sec: durationSec,
    p_credits_cost: totalCredits,
    p_aspect_ratio: renderConfig.aspectRatio,
    p_resolution_preset: renderConfig.exportResolution,
    p_is_vertical: renderConfig.isVertical,
    p_render_config: renderConfig,
    p_project_data: projectData,
    p_render_secret_hash: renderSecretHash,
    p_monthly_credits_charged: monthly_charged,
    p_purchased_credits_charged: purchased_charged,
  });

  if (rpcError || !rpcResult) {
    await supabase.rpc('refund_render_credits', {
      p_user_id: user.id,
      p_monthly_amount: monthly_charged,
      p_purchased_amount: purchased_charged,
    });
    return res.status(500).json({ error: 'Failed to create render job' });
  }

  if (rpcResult.error === 'limit_exceeded') {
    await supabase.rpc('refund_render_credits', {
      p_user_id: user.id,
      p_monthly_amount: monthly_charged,
      p_purchased_amount: purchased_charged,
    });
    return res.status(429).json({ error: `Parallel render limit (${rpcResult.limit}) reached. Wait for a render to finish.` });
  }

  const jobId = rpcResult.job_id as string;

  // ── 6. Trigger Modal worker ───────────────────────────────────────────────────
  try {
    const webhookRes = await fetch(process.env.MODAL_WEBHOOK_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MODAL_DISPATCH_SECRET}`,
      },
      body: JSON.stringify({ jobId, renderSecret }),
    });
    if (!webhookRes.ok) throw new Error(`Modal webhook returned ${webhookRes.status}`);
  } catch (e: any) {
    await supabase.rpc('refund_render_credits', {
      p_user_id: user.id,
      p_monthly_amount: monthly_charged,
      p_purchased_amount: purchased_charged,
    });
    await supabase
      .from('render_jobs')
      .update({ status: 'failed', error_message: `Failed to dispatch to worker: ${e.message}` })
      .eq('id', jobId);
    return res.status(502).json({ error: 'Failed to dispatch render worker' });
  }

  return res.status(200).json({ jobId });
}
