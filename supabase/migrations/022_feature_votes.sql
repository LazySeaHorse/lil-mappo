-- ============================================================
-- li'l Mappo — Migration 022: Per-user feature votes
--
-- Replaces the unused anonymous counter table from migration 001
-- (feature_id PK + count, open insert policy, never read by the app) with a
-- one-row-per-(user, feature) table. Votes are never exposed directly: the
-- browser can only call two SECURITY DEFINER RPCs that return coarse tier
-- labels and the caller's own vote state. No counts, weights or identities
-- leave the database.
--
-- All tunables live in feature_vote_params(). Paid = an active subscription
-- (or a cancelling one that has not yet reached its renewal_date); paid votes
-- weigh more than free ones. A feature's share is its voters' weight divided
-- by the total weight of recently active users (plus every voter), floored so
-- a young user base cannot make one vote look like a landslide.
-- ============================================================

BEGIN;

-- Legacy counter table from migration 001 (approved for removal, no readers).
DROP TABLE IF EXISTS public.feature_votes CASCADE;

CREATE TABLE public.feature_votes (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_id text        NOT NULL
    CHECK (feature_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(feature_id) <= 48),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_id)
);

CREATE INDEX feature_votes_feature_id_idx ON public.feature_votes (feature_id);

-- Same lockdown pattern as migration 020: RLS on, no policies, no browser grants.
ALTER TABLE public.feature_votes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feature_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feature_votes TO service_role;

-- ── Tunables (single place) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.feature_vote_params()
RETURNS TABLE (
  paid_weight             int,
  free_weight             int,
  denominator_floor       int,
  active_window           interval,
  few_max                 numeric,
  some_max                numeric,
  many_max                numeric,
  min_voters_some         int,
  min_voters_many         int,
  min_voters_most         int,
  most_requested_min_voters int,
  max_votes_per_user      int
)
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT 5, 1, 25, interval '45 days', 0.05, 0.15, 0.35, 2, 5, 10, 5, 50;
$$;

-- ── Private helper: weight of every relevant user ───────────
-- Relevant = recently active users UNION everyone who has voted, so a feature's
-- share can never exceed 100%.

CREATE OR REPLACE FUNCTION public.feature_vote_weights()
RETURNS TABLE (user_id uuid, weight int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH p AS (SELECT * FROM public.feature_vote_params()),
  last_session AS (
    SELECT s.user_id, max(s.updated_at) AS at
    FROM auth.sessions s
    GROUP BY s.user_id
  ),
  relevant AS (
    SELECT u.id
    FROM auth.users u
    CROSS JOIN p
    LEFT JOIN last_session ls ON ls.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.email_confirmed_at IS NOT NULL
      AND NOT u.is_anonymous
      AND GREATEST(u.last_sign_in_at, ls.at) > now() - p.active_window
    UNION
    SELECT v.user_id FROM public.feature_votes v
  )
  SELECT
    r.id,
    CASE
      WHEN s.status = 'active'
        OR (s.status = 'cancelling' AND s.renewal_date >= current_date)
      THEN p.paid_weight
      ELSE p.free_weight
    END
  FROM relevant r
  CROSS JOIN p
  LEFT JOIN public.subscriptions s ON s.user_id = r.id;
$$;

-- ── Read: coarse tiers + caller's own vote state ────────────

CREATE OR REPLACE FUNCTION public.get_feature_vote_summaries(p_feature_ids text[])
RETURNS TABLE (feature_id text, tier text, most_requested boolean, has_voted boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids text[];
  v_max_ids int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.max_votes_per_user INTO v_max_ids FROM public.feature_vote_params() p;

  -- Reject oversized input before doing any work on it (the DISTINCT below is O(n log n)).
  IF cardinality(p_feature_ids) > v_max_ids THEN
    RAISE EXCEPTION 'too many feature ids' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT i), '{}') INTO v_ids
  FROM unnest(COALESCE(p_feature_ids, '{}')) AS i;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS i
    WHERE i IS NULL OR i !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(i) > 48
  ) THEN
    RAISE EXCEPTION 'invalid feature id' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH p AS (SELECT * FROM public.feature_vote_params()),
  w AS (SELECT * FROM public.feature_vote_weights()),
  total AS (
    SELECT GREATEST(COALESCE(sum(w.weight), 0), (SELECT p.denominator_floor FROM p))::numeric AS denom
    FROM w
  ),
  agg AS (
    SELECT
      i AS fid,
      count(v.user_id) AS voters,
      COALESCE(sum(w.weight), 0) AS score
    FROM unnest(v_ids) AS i
    LEFT JOIN public.feature_votes v ON v.feature_id = i
    LEFT JOIN w ON w.user_id = v.user_id
    GROUP BY i
  ),
  rated AS (
    SELECT
      a.fid, a.voters, a.score,
      -- raw tier rank from share: 0 none, 1 few, 2 some, 3 many, 4 most
      CASE
        WHEN a.voters = 0 THEN 0
        WHEN a.score / t.denom < p.few_max THEN 1
        WHEN a.score / t.denom < p.some_max THEN 2
        WHEN a.score / t.denom <= p.many_max THEN 3
        ELSE 4
      END AS raw_rank,
      -- highest rank the voter count supports
      CASE
        WHEN a.voters = 0 THEN 0
        WHEN a.voters >= p.min_voters_most THEN 4
        WHEN a.voters >= p.min_voters_many THEN 3
        WHEN a.voters >= p.min_voters_some THEN 2
        ELSE 1
      END AS cap_rank
    FROM agg a CROSS JOIN total t CROSS JOIN p
  )
  SELECT
    r.fid,
    (ARRAY['none', 'few', 'some', 'many', 'most'])[LEAST(r.raw_rank, r.cap_rank) + 1],
    (
      r.voters >= p.most_requested_min_voters
      AND r.score > COALESCE((SELECT max(o.score) FROM rated o WHERE o.fid <> r.fid), -1)
    ),
    EXISTS (
      SELECT 1 FROM public.feature_votes mine
      WHERE mine.user_id = v_uid AND mine.feature_id = r.fid
    )
  FROM rated r CROSS JOIN p
  ORDER BY r.fid;
END;
$$;

-- ── Write: idempotent vote / unvote ─────────────────────────

CREATE OR REPLACE FUNCTION public.set_feature_vote(p_feature_id text, p_voted boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_feature_id IS NULL
     OR p_feature_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR length(p_feature_id) > 48 THEN
    RAISE EXCEPTION 'invalid feature id' USING ERRCODE = '22023';
  END IF;
  IF p_voted IS NULL THEN
    RAISE EXCEPTION 'p_voted is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize one user's votes so the per-user cap cannot be raced past.
  PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));

  IF p_voted THEN
    SELECT p.max_votes_per_user INTO v_max FROM public.feature_vote_params() p;
    IF NOT EXISTS (
         SELECT 1 FROM public.feature_votes
         WHERE user_id = v_uid AND feature_id = p_feature_id
       )
       AND (SELECT count(*) FROM public.feature_votes WHERE user_id = v_uid) >= v_max THEN
      RAISE EXCEPTION 'vote limit reached' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.feature_votes (user_id, feature_id)
    VALUES (v_uid, p_feature_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.feature_votes
    WHERE user_id = v_uid AND feature_id = p_feature_id;
  END IF;

  RETURN p_voted;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────
-- Supabase's default privileges hand EXECUTE on new public functions to anon
-- and authenticated, so revoke explicitly before granting.

REVOKE ALL ON FUNCTION public.feature_vote_params()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feature_vote_weights() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_feature_vote_summaries(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_feature_vote(text, boolean)    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_feature_vote_summaries(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_feature_vote(text, boolean)    TO authenticated;

COMMIT;
