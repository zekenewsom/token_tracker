-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN "last_sync_time" INTEGER DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN "last_transaction_time" INTEGER DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN "sync_priority" INTEGER DEFAULT 1;

-- CreateTable
CREATE TABLE "SyncState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sync_type" TEXT NOT NULL,
    "last_sync_time" INTEGER NOT NULL,
    "last_block_time" INTEGER,
    "last_signature" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HolderSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshot_time" INTEGER NOT NULL,
    "total_holders" INTEGER NOT NULL,
    "total_supply" REAL NOT NULL,
    "top_holder_balance" REAL NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_sync_type_key" ON "SyncState"("sync_type");

-- CreateIndex
CREATE INDEX "SyncState_sync_type_idx" ON "SyncState"("sync_type");

-- CreateIndex
CREATE INDEX "SyncState_last_sync_time_idx" ON "SyncState"("last_sync_time");

-- CreateIndex
CREATE INDEX "HolderSnapshot_snapshot_time_idx" ON "HolderSnapshot"("snapshot_time");

-- CreateIndex
CREATE INDEX "Wallet_last_sync_time_idx" ON "Wallet"("last_sync_time");

-- CreateIndex
CREATE INDEX "Wallet_sync_priority_idx" ON "Wallet"("sync_priority");
