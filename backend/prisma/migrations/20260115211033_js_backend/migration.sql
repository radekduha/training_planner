-- CreateTable
CREATE TABLE "TrainingType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Trainer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "homeAddress" TEXT NOT NULL,
    "homeLat" REAL,
    "homeLng" REAL,
    "hourlyRate" REAL,
    "travelRateKm" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainerSkill" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trainerId" INTEGER NOT NULL,
    "trainingTypeId" INTEGER NOT NULL,
    CONSTRAINT "TrainerSkill_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainerSkill_trainingTypeId_fkey" FOREIGN KEY ("trainingTypeId") REFERENCES "TrainingType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainerRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trainerId" INTEGER NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleValue" TEXT NOT NULL,
    CONSTRAINT "TrainerRule_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Training" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trainingTypeId" INTEGER NOT NULL,
    "customerName" TEXT,
    "address" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "startDatetime" DATETIME NOT NULL,
    "endDatetime" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "assignedTrainerId" INTEGER,
    "assignmentReason" TEXT,
    "googleEventId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Training_trainingTypeId_fkey" FOREIGN KEY ("trainingTypeId") REFERENCES "TrainingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Training_assignedTrainerId_fkey" FOREIGN KEY ("assignedTrainerId") REFERENCES "Trainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeocodingCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingType_name_key" ON "TrainingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerSkill_trainerId_trainingTypeId_key" ON "TrainerSkill"("trainerId", "trainingTypeId");

-- CreateIndex
CREATE INDEX "TrainerRule_trainerId_ruleType_idx" ON "TrainerRule"("trainerId", "ruleType");

-- CreateIndex
CREATE INDEX "Training_startDatetime_idx" ON "Training"("startDatetime");

-- CreateIndex
CREATE INDEX "Training_status_idx" ON "Training"("status");

-- CreateIndex
CREATE INDEX "Training_assignedTrainerId_idx" ON "Training"("assignedTrainerId");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingCache_address_key" ON "GeocodingCache"("address");
