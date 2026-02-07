-- AlterTable
ALTER TABLE "Training" ADD COLUMN "changedBy" TEXT;
ALTER TABLE "Training" ADD COLUMN "requestWindowEnd" DATETIME;
ALTER TABLE "Training" ADD COLUMN "requestWindowStart" DATETIME;

-- CreateTable
CREATE TABLE "TrainerAvailabilitySlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trainerId" INTEGER NOT NULL,
    "startDatetime" DATETIME NOT NULL,
    "endDatetime" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedTrainingId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainerAvailabilitySlot_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainerAvailabilitySlot_assignedTrainingId_fkey" FOREIGN KEY ("assignedTrainingId") REFERENCES "Training" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrainingType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 240,
    "teachingHours" REAL,
    "maxParticipants" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TrainingType" ("createdAt", "id", "maxParticipants", "name", "teachingHours", "updatedAt") SELECT "createdAt", "id", "maxParticipants", "name", "teachingHours", "updatedAt" FROM "TrainingType";
DROP TABLE "TrainingType";
ALTER TABLE "new_TrainingType" RENAME TO "TrainingType";
CREATE UNIQUE INDEX "TrainingType_name_key" ON "TrainingType"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAvailabilitySlot_assignedTrainingId_key" ON "TrainerAvailabilitySlot"("assignedTrainingId");

-- CreateIndex
CREATE INDEX "TrainerAvailabilitySlot_trainerId_startDatetime_endDatetime_idx" ON "TrainerAvailabilitySlot"("trainerId", "startDatetime", "endDatetime");

-- CreateIndex
CREATE INDEX "TrainerAvailabilitySlot_isActive_startDatetime_idx" ON "TrainerAvailabilitySlot"("isActive", "startDatetime");

-- CreateIndex
CREATE INDEX "Training_requestWindowStart_requestWindowEnd_idx" ON "Training"("requestWindowStart", "requestWindowEnd");

-- Data migration for existing rows
UPDATE "Training"
SET
  "requestWindowStart" = COALESCE("requestWindowStart", "startDatetime"),
  "requestWindowEnd" = COALESCE("requestWindowEnd", "endDatetime");

UPDATE "Training"
SET "status" = 'open'
WHERE "status" = 'waiting';
