/*
  Warnings:

  - You are about to drop the column `average_acquisition_price_usd` on the `TokenHolder` table. All the data in the column will be lost.
  - You are about to drop the column `total_cost_usd` on the `TokenHolder` table. All the data in the column will be lost.
  - You are about to drop the column `total_tokens_acquired` on the `TokenHolder` table. All the data in the column will be lost.
  - You are about to drop the column `solAmount` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `sol_price_usd` on the `Transaction` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TokenHolder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wallet_id" INTEGER NOT NULL,
    "balance" REAL NOT NULL,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenHolder_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TokenHolder" ("balance", "id", "last_updated", "wallet_id") SELECT "balance", "id", "last_updated", "wallet_id" FROM "TokenHolder";
DROP TABLE "TokenHolder";
ALTER TABLE "new_TokenHolder" RENAME TO "TokenHolder";
CREATE UNIQUE INDEX "TokenHolder_wallet_id_key" ON "TokenHolder"("wallet_id");
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "signature" TEXT NOT NULL,
    "blockTime" INTEGER NOT NULL,
    "type" TEXT,
    "tokenAmount" REAL,
    "source_wallet_id" INTEGER,
    "destination_wallet_id" INTEGER,
    CONSTRAINT "Transaction_source_wallet_id_fkey" FOREIGN KEY ("source_wallet_id") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_destination_wallet_id_fkey" FOREIGN KEY ("destination_wallet_id") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("blockTime", "destination_wallet_id", "id", "signature", "source_wallet_id", "tokenAmount", "type") SELECT "blockTime", "destination_wallet_id", "id", "signature", "source_wallet_id", "tokenAmount", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_signature_key" ON "Transaction"("signature");
CREATE TABLE "new_Wallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Wallet" ("address", "id") SELECT "address", "id" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
