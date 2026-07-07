DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Router"
    WHERE "remotePort" IS NOT NULL
    GROUP BY "remotePort"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique Router.remotePort: duplicate non-null remotePort values exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Router"
    WHERE "remoteSstpIp" IS NOT NULL
    GROUP BY "remoteSstpIp"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique Router.remoteSstpIp: duplicate non-null remoteSstpIp values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Router_remotePort_key" ON "Router"("remotePort");
CREATE UNIQUE INDEX "Router_remoteSstpIp_key" ON "Router"("remoteSstpIp");