CREATE TABLE "refund_payouts" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "campusId" TEXT, "studentId" TEXT NOT NULL,
 "refundId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "amount" DECIMAL(10,2) NOT NULL, "paymentMethod" TEXT NOT NULL, "proofReference" TEXT NOT NULL,
 "recipientName" TEXT NOT NULL, "paidAt" TIMESTAMP(3) NOT NULL, "recordedById" TEXT NOT NULL,
 "recordedByName" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "refund_payouts_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "refund_payouts_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "refund_payouts_amount_positive" CHECK ("amount">0)
);
CREATE UNIQUE INDEX "refund_payouts_refundId_key" ON "refund_payouts"("refundId");
CREATE UNIQUE INDEX "refund_payouts_organizationId_requestId_key" ON "refund_payouts"("organizationId","requestId");
CREATE UNIQUE INDEX "refund_payouts_organizationId_proofReference_key" ON "refund_payouts"("organizationId","proofReference");
CREATE INDEX "refund_payouts_organizationId_campusId_paidAt_idx" ON "refund_payouts"("organizationId","campusId","paidAt");
