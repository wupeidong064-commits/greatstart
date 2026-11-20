CREATE TABLE "revoked_auth_sessions" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "revoked_auth_sessions_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "revoked_auth_sessions_expiresAt_idx" ON "revoked_auth_sessions"("expiresAt");
