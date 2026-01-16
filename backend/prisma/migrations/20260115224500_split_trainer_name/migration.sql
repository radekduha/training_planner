-- AlterTable
ALTER TABLE "Trainer" RENAME COLUMN "name" TO "firstName";
ALTER TABLE "Trainer" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
