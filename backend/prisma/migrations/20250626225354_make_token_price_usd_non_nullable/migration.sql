/*
  Warnings:

  - Made the column `token_price_usd` on table `Transaction` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "signature" TEXT NOT NULL,
    "blockTime" INTEGER NOT NULL,
    "type" TEXT,
    "tokenAmount" REAL,
    "token_price_usd" REAL NOT NULL,
    "source_wallet_id" INTEGER,
    "destination_wallet_id" INTEGER,
    CONSTRAINT "Transaction_source_wallet_id_fkey" FOREIGN KEY ("source_wallet_id") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_destination_wallet_id_fkey" FOREIGN KEY ("destination_wallet_id") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("blockTime", "destination_wallet_id", "id", "signature", "source_wallet_id", "tokenAmount", "token_price_usd", "type") SELECT "blockTime", "destination_wallet_id", "id", "signature", "source_wallet_id", "tokenAmount", "token_price_usd", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_signature_key" ON "Transaction"("signature");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
