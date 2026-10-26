CREATE TABLE "PendingFileDeletion" (
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PendingFileDeletion_pkey" PRIMARY KEY ("storageKey")
);
