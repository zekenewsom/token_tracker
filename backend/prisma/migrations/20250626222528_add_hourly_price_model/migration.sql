-- CreateTable
CREATE TABLE "HourlyPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" INTEGER NOT NULL,
    "price_usd" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HourlyPrice_timestamp_key" ON "HourlyPrice"("timestamp");
