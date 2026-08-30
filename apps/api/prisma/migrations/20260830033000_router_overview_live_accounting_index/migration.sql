-- Router overview only needs recent accounting rows that are still open.
-- Keep the index partial so closed historical sessions do not bloat the hot read path.
CREATE INDEX IF NOT EXISTS idx_radacct_open_recent_accounting
  ON radacct(acctupdatetime, acctstarttime, nasipaddress, username)
  WHERE acctstoptime IS NULL;
