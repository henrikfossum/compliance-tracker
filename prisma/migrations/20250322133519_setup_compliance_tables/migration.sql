-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "compareAtPrice" REAL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReference" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ProductCompliance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "referencePrice" REAL,
    "lastChecked" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOnSale" BOOLEAN NOT NULL DEFAULT false,
    "saleStartDate" DATETIME,
    "isCompliant" BOOLEAN NOT NULL DEFAULT true,
    "issues" TEXT
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trackingFrequency" INTEGER NOT NULL DEFAULT 12,
    "lastScan" DATETIME,
    "countryRules" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "PriceHistory_shop_productId_variantId_idx" ON "PriceHistory"("shop", "productId", "variantId");

-- CreateIndex
CREATE INDEX "PriceHistory_timestamp_idx" ON "PriceHistory"("timestamp");

-- CreateIndex
CREATE INDEX "ComplianceRule_countryCode_ruleType_idx" ON "ComplianceRule"("countryCode", "ruleType");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCompliance_shop_productId_variantId_key" ON "ProductCompliance"("shop", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
