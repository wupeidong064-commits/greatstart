CREATE TABLE "integration_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "creatorSessionTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "integration_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "integration_keys_organizationId_key" ON "integration_keys"("organizationId");
CREATE UNIQUE INDEX "integration_keys_keyHash_key" ON "integration_keys"("keyHash");
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
