CREATE TABLE IF NOT EXISTS public_target_rate_limits (
  endpoint TEXT NOT NULL,
  target_ip TEXT NOT NULL,
  window_slot INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (endpoint, target_ip, window_slot)
);

CREATE INDEX IF NOT EXISTS idx_public_target_rate_limits_updated_at
  ON public_target_rate_limits (updated_at DESC);
