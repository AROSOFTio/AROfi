-- Disconnect retry bookkeeping: failed CoA/Disconnect-Requests are retried
-- with backoff instead of being abandoned after one attempt.
ALTER TABLE "DisconnectionAttempt" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DisconnectionAttempt" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);

-- Realtime bridge: FreeRADIUS writes accounting (radacct) and auth results
-- (radpostauth) straight into Postgres via rlm_sql. These triggers push a
-- NOTIFY the moment a row lands, so the API reacts in milliseconds instead
-- of waiting for the next polling sweep.
CREATE OR REPLACE FUNCTION arofi_notify_radacct() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'arofi_radius_events',
    json_build_object('table', 'radacct', 'id', NEW.radacctid)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION arofi_notify_radpostauth() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'arofi_radius_events',
    json_build_object('table', 'radpostauth', 'id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'radacct') THEN
    DROP TRIGGER IF EXISTS arofi_radacct_notify ON radacct;
    CREATE TRIGGER arofi_radacct_notify
      AFTER INSERT OR UPDATE ON radacct
      FOR EACH ROW EXECUTE FUNCTION arofi_notify_radacct();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'radpostauth') THEN
    DROP TRIGGER IF EXISTS arofi_radpostauth_notify ON radpostauth;
    CREATE TRIGGER arofi_radpostauth_notify
      AFTER INSERT ON radpostauth
      FOR EACH ROW EXECUTE FUNCTION arofi_notify_radpostauth();
  END IF;
END $$;
