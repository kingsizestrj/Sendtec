-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "code" TEXT,
ADD COLUMN     "script" JSONB,
ADD COLUMN     "scriptError" TEXT,
ADD COLUMN     "scriptSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AutomationStep" ADD COLUMN     "code" TEXT,
ADD COLUMN     "script" JSONB;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "code" TEXT,
ADD COLUMN     "script" JSONB,
ADD COLUMN     "scriptError" TEXT,
ADD COLUMN     "scriptSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Automation_code_key" ON "Automation"("code");

-- CreateIndex
CREATE INDEX "Campaign_code_idx" ON "Campaign"("code");

