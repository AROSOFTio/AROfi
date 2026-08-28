-- Router overview treats sessions without an interim update as live when their
-- start time is inside the accounting liveness window. Keep that fallback path
-- indexable without growing an index across historical/updated sessions.
CREATE INDEX IF NOT EXISTS idx_radacct_live_start_nas_username
  ON radacct(acctstarttime, nasipaddress, username)
  WHERE acctstoptime IS NULL AND acctupdatetime IS NULL;
