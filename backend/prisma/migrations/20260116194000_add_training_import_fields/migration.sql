-- AlterTable
ALTER TABLE "Training" ADD COLUMN "visitors" INTEGER;
ALTER TABLE "Training" ADD COLUMN "accreditation" BOOLEAN;
ALTER TABLE "Training" ADD COLUMN "hours" INTEGER;
ALTER TABLE "Training" ADD COLUMN "trainersFee" REAL;
ALTER TABLE "Training" ADD COLUMN "priceWithVat" REAL;
ALTER TABLE "Training" ADD COLUMN "payerAddress" TEXT;
ALTER TABLE "Training" ADD COLUMN "payerId" TEXT;
ALTER TABLE "Training" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Training" ADD COLUMN "trainingPlace" TEXT;
ALTER TABLE "Training" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Training" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Training" ADD COLUMN "invoiceEmail" TEXT;
ALTER TABLE "Training" ADD COLUMN "approvalEmail" TEXT;
ALTER TABLE "Training" ADD COLUMN "studyMaterials" TEXT;
ALTER TABLE "Training" ADD COLUMN "infoForTheTrainer" TEXT;
ALTER TABLE "Training" ADD COLUMN "pp" TEXT;
ALTER TABLE "Training" ADD COLUMN "d" TEXT;
