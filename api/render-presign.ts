import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

/**
 * POST /api/render-presign
 * Body: { jobId, secret }
 *
 * Verifies secret, then returns a presigned PUT URL for uploading the rendered
 * MP4 directly from the headless Chromium instance to DigitalOcean Spaces.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobId, secret } = (req.body ?? {}) as { jobId?: string; secret?: string };
  if (!jobId || !secret) return res.status(400).json({ error: 'Missing jobId or secret' });

  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: job, error } = await supabase
    .from('render_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('render_secret_hash', secretHash)
    .maybeSingle();

  if (error || !job) return res.status(404).json({ error: 'Job not found or secret invalid' });

  const s3 = new S3Client({
    region: process.env.DO_SPACES_REGION!,
    endpoint: `https://${process.env.DO_SPACES_ENDPOINT!}`,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
  });

  const outputKey = `renders/${jobId}.mp4`;
  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET!,
      Key: outputKey,
      ContentType: 'video/mp4',
      ACL: 'public-read',
    }),
    { expiresIn: 3600 },
  );

  const outputUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/${outputKey}`;

  return res.status(200).json({ presignedUrl, outputUrl });
}
