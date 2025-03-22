-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "compareAtPrice" REAL,
    "displayPrice" REAL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReference" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ComplianceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trackingFrequency" INTEGER NOT NULL DEFAULT 12,
    "lastScan" DATETIME,
    "countryCode" TEXT NOT NULL DEFAULT 'NO',
    "rules" TEXT
);

-- CreateTable
CREATE TABLE "ProductCompliance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "referencePrice" REAL NOT NULL,
    "lastUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onSale" BOOLEAN NOT NULL DEFAULT false,
    "saleStartDate" DATETIME,
    "isCompliant" BOOLEAN NOT NULL DEFAULT true,
    "issues" TEXT
);

-- CreateIndex
CREATE INDEX "PriceHistory_shop_productId_variantId_idx" ON "PriceHistory"("shop", "productId", "variantId");

-- CreateIndex
CREATE INDEX "PriceHistory_timestamp_idx" ON "PriceHistory"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSettings_shop_key" ON "ComplianceSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCompliance_shop_productId_variantId_key" ON "ProductCompliance"("shop", "productId", "variantId");
