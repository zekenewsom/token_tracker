-- CreateTable
CREATE TABLE "Wallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "signature" TEXT NOT NULL,
    "blockTime" INTEGER NOT NULL,
    "type" TEXT,
    "tokenAmount" REAL,
    "solAmount" REAL,
    "source_wallet_id" INTEGER,
    "destination_wallet_id" INTEGER,
    "senderAddress" TEXT,
    "receiverAddress" TEXT,
    CONSTRAINT "Transaction_source_wallet_id_fkey" FOREIGN KEY ("source_wallet_id") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_destination_wallet_id_fkey" FOREIGN KEY ("destination_wallet_id") REFERENCES "Wallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenHolder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wallet_id" INTEGER NOT NULL,
    "balance" REAL NOT NULL,
    "average_acquisition_price" REAL,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenHolder_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_signature_key" ON "Transaction"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "TokenHolder_wallet_id_key" ON "TokenHolder"("wallet_id");
