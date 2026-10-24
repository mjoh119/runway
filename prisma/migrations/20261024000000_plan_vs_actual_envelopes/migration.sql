-- CreateEnum
CREATE TYPE "ResetPeriod" AS ENUM ('EACH_PAY_CYCLE', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "OneOffEntry" ADD COLUMN     "actualDate" DATE;

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "budgetCents" INTEGER NOT NULL,
    "resetPeriod" "ResetPeriod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccurrenceRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "status" "EntryStatus" NOT NULL,
    "description" TEXT,
    "estimatedAmountCents" INTEGER NOT NULL,
    "actualAmountCents" INTEGER,
    "actualDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccurrenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Envelope_workspaceId_idx" ON "Envelope"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_workspaceId_nameKey_key" ON "Envelope"("workspaceId", "nameKey");

-- CreateIndex
CREATE INDEX "LineItem_workspaceId_envelopeId_purchaseDate_idx" ON "LineItem"("workspaceId", "envelopeId", "purchaseDate");

-- CreateIndex
CREATE INDEX "OccurrenceRecord_workspaceId_status_idx" ON "OccurrenceRecord"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OccurrenceRecord_workspaceId_scheduleId_occurrenceDate_key" ON "OccurrenceRecord"("workspaceId", "scheduleId", "occurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionKey_workspaceId_key_key" ON "SubmissionKey"("workspaceId", "key");

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceRecord" ADD CONSTRAINT "OccurrenceRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceRecord" ADD CONSTRAINT "OccurrenceRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceRecord" ADD CONSTRAINT "OccurrenceRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionKey" ADD CONSTRAINT "SubmissionKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

