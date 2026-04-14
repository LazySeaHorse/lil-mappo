-- Migration 012: atomic render job insert with parallel-limit check
--
-- Replaces the non-atomic SELECT-count / INSERT pattern in render-dispatch.ts
-- with a single Postgres function that holds a per-user advisory lock for the
-- duration of the transaction, guaranteeing the count check and the insert are
-- never interleaved by concurrent requests from the same user.

CREATE OR REPLACE FUNCTION create_render_job(
  p_user_id                    UUID,
  p_fps                        INT,
  p_duration_sec               NUMERIC,
  p_credits_cost               INT,
  p_aspect_ratio               TEXT,
  p_resolution_preset          TEXT,
  p_is_vertical                BOOLEAN,
  p_render_config              JSONB,
  p_project_data               JSONB,
  p_render_secret_hash         TEXT,
  p_monthly_credits_charged    INT,
  p_purchased_credits_charged  INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_parallel_limit  INT;
  v_active_count    INT;
  v_job_id          UUID;
BEGIN
  -- Acquire a per-user advisory lock for the lifetime of this transaction.
  -- Concurrent calls for the same user will queue here; different users are
  -- unaffected because the lock key is derived from the user's UUID.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  -- Resolve the user's parallel render limit from their active subscription.
  SELECT COALESCE(parallel_renders, 1)
    INTO v_parallel_limit
    FROM subscriptions
   WHERE user_id = p_user_id AND status = 'active'
   LIMIT 1;

  IF v_parallel_limit IS NULL THEN
    v_parallel_limit := 1;
  END IF;

  -- Count active jobs. Safe to do here because the advisory lock above
  -- prevents any other call for this user from inserting concurrently.
  SELECT COUNT(*)
    INTO v_active_count
    FROM render_jobs
   WHERE user_id = p_user_id
     AND status IN ('queued', 'rendering');

  IF v_active_count >= v_parallel_limit THEN
    RETURN jsonb_build_object('error', 'limit_exceeded', 'limit', v_parallel_limit);
  END IF;

  INSERT INTO render_jobs (
    user_id,
    status,
    fps,
    duration_sec,
    credits_cost,
    gpu,
    aspect_ratio,
    resolution_preset,
    is_vertical,
    render_config,
    project_data,
    render_secret_hash,
    monthly_credits_charged,
    purchased_credits_charged
  ) VALUES (
    p_user_id,
    'queued',
    p_fps,
    p_duration_sec,
    p_credits_cost,
    TRUE,
    p_aspect_ratio,
    p_resolution_preset,
    p_is_vertical,
    p_render_config,
    p_project_data,
    p_render_secret_hash,
    p_monthly_credits_charged,
    p_purchased_credits_charged
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id);
END;
$$;

-- Lock it down to service_role only, matching the other credit RPCs.
REVOKE EXECUTE ON FUNCTION create_render_job(UUID, INT, NUMERIC, INT, TEXT, TEXT, BOOLEAN, JSONB, JSONB, TEXT, INT, INT)
  FROM PUBLIC, anon, authenticated;