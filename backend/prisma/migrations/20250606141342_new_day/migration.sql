-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TokenHolder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wallet_id" INTEGER NOT NULL,
    "balance" REAL NOT NULL,
    "average_acquisition_price_usd" REAL,
    "total_cost_usd" REAL NOT NULL DEFAULT 0,
    "total_tokens_acquired" REAL NOT NULL DEFAULT 0,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenHolder_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TokenHolder" ("average_acquisition_price_usd", "balance", "id", "last_updated", "wallet_id") SELECT "average_acquisition_price_usd", "balance", "id", "last_updated", "wallet_id" FROM "TokenHolder";
DROP TABLE "TokenHolder";
ALTER TABLE "new_TokenHolder" RENAME TO "TokenHolder";
CREATE UNIQUE INDEX "TokenHolder_wallet_id_key" ON "TokenHolder"("wallet_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
