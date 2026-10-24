-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'INVESTMENT', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "IntervalType" AS ENUM ('DAYS', 'WEEKS', 'MONTHS', 'DAYS_OF_MONTH');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('INCOME', 'DEBIT');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('PLANNED', 'PENDING', 'POSTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lowBalanceThresholdCents" INTEGER,
    "projectionHorizonDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "ledgerBalanceCents" INTEGER NOT NULL,
    "availableBalanceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "intervalType" "IntervalType" NOT NULL,
    "intervalValue" INTEGER NOT NULL,
    "daysOfMonth" INTEGER[],
    "startDate" DATE NOT NULL,
    "estimatedAmountCents" INTEGER NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOffEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postDate" DATE NOT NULL,
    "estimatedAmountCents" INTEGER NOT NULL,
    "actualAmountCents" INTEGER,
    "status" "EntryStatus" NOT NULL DEFAULT 'PLANNED',
    "entryType" "EntryType" NOT NULL,
    "holdReleaseDate" DATE,
    "isHoldEstimated" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneOffEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workspace_lastActivity_idx" ON "Workspace"("lastActivity");

-- CreateIndex
CREATE INDEX "Account_workspaceId_isPrimary_idx" ON "Account"("workspaceId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "Account_workspaceId_name_key" ON "Account"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Schedule_workspaceId_accountId_idx" ON "Schedule"("workspaceId", "accountId");

-- CreateIndex
CREATE INDEX "OneOffEntry_workspaceId_accountId_postDate_idx" ON "OneOffEntry"("workspaceId", "accountId", "postDate");

-- CreateIndex
CREATE INDEX "OneOffEntry_workspaceId_status_idx" ON "OneOffEntry"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOffEntry" ADD CONSTRAINT "OneOffEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOffEntry" ADD CONSTRAINT "OneOffEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

