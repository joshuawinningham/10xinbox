-- Create response_time_cache table for caching avg. response time per user per day
CREATE TABLE IF NOT EXISTS response_time_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  average_response_time INTEGER, -- in seconds
  reply_count INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- Add index for fast lookup
CREATE INDEX IF NOT EXISTS response_time_cache_user_date_idx ON response_time_cache(user_id, date); 