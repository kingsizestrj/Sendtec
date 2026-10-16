-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "automationId" TEXT,
ADD COLUMN     "automationStepId" TEXT;

-- CreateTable
CREATE TABLE "SavedAudience" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStep" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "savedAudienceId" TEXT,
    "audience" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "headerMediaUrl" TEXT,
    "cooldownDays" INTEGER NOT NULL DEFAULT 7,
    "lastRunDate" TEXT,
    "lastResult" TEXT,

    CONSTRAINT "AutomationStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_automationStepId_idx" ON "Campaign"("automationStepId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_automationStepId_fkey" FOREIGN KEY ("automationStepId") REFERENCES "AutomationStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAudience" ADD CONSTRAINT "SavedAudience_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_savedAudienceId_fkey" FOREIGN KEY ("savedAudienceId") REFERENCES "SavedAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
