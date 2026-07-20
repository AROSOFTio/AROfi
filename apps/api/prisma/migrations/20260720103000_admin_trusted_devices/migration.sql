CREATE TABLE IF NOT EXISTS AdminTrustedDevice (
  id TEXT NOT NULL,
  userId TEXT NOT NULL,
  tokenHash TEXT NOT NULL,
  userAgent TEXT,
  expiresAt TIMESTAMP(3) NOT NULL,
  lastUsedAt TIMESTAMP(3),
  revokedAt TIMESTAMP(3),
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT AdminTrustedDevice_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS AdminTrustedDevice_tokenHash_key
  ON AdminTrustedDevice(tokenHash);

CREATE INDEX IF NOT EXISTS AdminTrustedDevice_userId_revokedAt_expiresAt_idx
  ON AdminTrustedDevice(userId, revokedAt, expiresAt);

ALTER TABLE AdminTrustedDevice
  ADD CONSTRAINT AdminTrustedDevice_userId_fkey
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE;
