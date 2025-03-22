// app/services/complianceChecker.server.ts
import prisma from "../db.server";

interface ComplianceIssue {
  rule: string;
  message: string;
}

/**
 * Checks compliance for a specific product variant
 */
export async function checkProductCompliance(shop: string, productId: string, variantId: string) {
  try {
    console.log(`Checking compliance for product: ${productId}, variant: ${variantId}`);
    
    // Get the price history for this product variant
    const priceHistory = await prisma.priceHistory.findMany({
      where: { 
        shop, 
        productId, 
        variantId 
      },
      orderBy: { timestamp: 'desc' },
    });
    
    if (priceHistory.length === 0) {
      console.log(`No price history found for product variant ${productId}/${variantId}`);
      return { success: false, error: 'No price history found' };
    }
    
    // Get the current price and compare-at price
    const currentEntry = priceHistory[0];
    const currentPrice = currentEntry.price;
    const compareAtPrice = currentEntry.compareAtPrice;
    
    // Check if product is on sale
    const isOnSale = compareAtPrice !== null && compareAtPrice > currentPrice;
    
    // Initialize compliance variables
    let isCompliant = true;
    const issues: ComplianceIssue[] = [];
    
    // Apply Norwegian compliance rules if the product is on sale
    if (isOnSale) {
      // Get the shop settings to determine which rules to apply
      const shopSettings = await prisma.shopSettings.findUnique({
        where: { shop }
      });
      
      // Apply Norwegian rules by default
      const countryRules = shopSettings?.countryRules || 'NO';
      
      if (countryRules.includes('NO')) {
        // Apply Norwegian rules
        
        // Rule 1: Reference price must be the lowest price in the last 30 days
        const complianceResult = await checkNorwegianReferencePrice(shop, productId, variantId, compareAtPrice);
        if (!complianceResult.isCompliant) {
          isCompliant = false;
          issues.push({
            rule: 'førpris',
            message: complianceResult.message
          });
        }
        
        // Rule 2: Check sales duration - sales shouldn't run too long
        const durationResult = await checkSalesDuration(shop, productId, variantId);
        if (!durationResult.isCompliant) {
          isCompliant = false;
          issues.push({
            rule: 'salesDuration',
            message: durationResult.message
          });
        }
        
        // Rule 3: Check sales frequency - shouldn't have sales too often
        const frequencyResult = await checkSalesFrequency(shop, productId, variantId);
        if (!frequencyResult.isCompliant) {
          isCompliant = false;
          issues.push({
            rule: 'salesFrequency',
            message: frequencyResult.message
          });
        }
      }
    }
    
    // Update the compliance record
    await prisma.productCompliance.upsert({
      where: {
        shop_productId_variantId: { shop, productId, variantId }
      },
      update: {
        referencePrice: compareAtPrice,
        lastChecked: new Date(),
        isOnSale,
        saleStartDate: isOnSale ? (
          // If we already have a record with a sale start date, keep it
          await prisma.productCompliance.findUnique({
            where: { shop_productId_variantId: { shop, productId, variantId } },
            select: { saleStartDate: true, isOnSale: true }
          }).then(existing => 
            existing?.isOnSale ? existing.saleStartDate : new Date()
          )
        ) : null,
        isCompliant,
        issues: issues.length > 0 ? JSON.stringify(issues) : null
      },
      create: {
        shop,
        productId,
        variantId,
        referencePrice: compareAtPrice,
        lastChecked: new Date(),
        isOnSale,
        saleStartDate: isOnSale ? new Date() : null,
        isCompliant,
        issues: issues.length > 0 ? JSON.stringify(issues) : null
      }
    });
    
    console.log(`Compliance check completed for ${productId}/${variantId}. Compliant: ${isCompliant}`);
    
    return { 
      success: true, 
      isCompliant, 
      issues,
      isOnSale
    };
  } catch (error) {
    console.error(`Error checking compliance for product ${productId}/${variantId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Checks if the reference price (førpris) complies with Norwegian regulations
 */
async function checkNorwegianReferencePrice(shop: string, productId: string, variantId: string, compareAtPrice: number | null) {
  if (!compareAtPrice) {
    return { isCompliant: true, message: 'No reference price set' };
  }
  
  // Get the price history for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentPrices = await prisma.priceHistory.findMany({
    where: {
      shop,
      productId,
      variantId,
      timestamp: { gte: thirtyDaysAgo }
    },
    orderBy: { timestamp: 'asc' }
  });
  
  if (recentPrices.length === 0) {
    return { isCompliant: false, message: 'No price history available for the last 30 days' };
  }
  
  // Find the lowest non-sale price in the last 30 days
  const regularPrices = recentPrices.filter(entry => !entry.compareAtPrice || entry.price >= entry.compareAtPrice);
  
  if (regularPrices.length === 0) {
    return { isCompliant: false, message: 'Product has been on sale for the entire 30-day period' };
  }
  
  const lowestRegularPrice = Math.min(...regularPrices.map(entry => entry.price));
  
  // Check if the reference price is the lowest regular price in the last 30 days
  if (compareAtPrice < lowestRegularPrice) {
    return { 
      isCompliant: false, 
      message: `Reference price (${compareAtPrice}) is lower than the lowest regular price in the last 30 days (${lowestRegularPrice})` 
    };
  }
  
  if (compareAtPrice > lowestRegularPrice) {
    return { 
      isCompliant: false, 
      message: `Reference price (${compareAtPrice}) must be the lowest regular price from the last 30 days (${lowestRegularPrice})` 
    };
  }
  
  return { isCompliant: true, message: 'Reference price complies with regulations' };
}

/**
 * Checks if the sale has been running for an acceptable duration
 */
async function checkSalesDuration(shop: string, productId: string, variantId: string) {
  // Get the current compliance record to check when the sale started
  const compliance = await prisma.productCompliance.findUnique({
    where: { shop_productId_variantId: { shop, productId, variantId } }
  });
  
  if (!compliance || !compliance.saleStartDate) {
    return { isCompliant: true, message: 'Sale just started or not previously tracked' };
  }
  
  const saleStartDate = new Date(compliance.saleStartDate);
  const now = new Date();
  const saleDurationDays = Math.floor((now.getTime() - saleStartDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Norwegian regulations typically limit sales to 6-8 weeks
  const maxSaleDurationDays = 56; // 8 weeks
  
  if (saleDurationDays > maxSaleDurationDays) {
    return { 
      isCompliant: false, 
      message: `Sale has been running for ${saleDurationDays} days, which exceeds the maximum of ${maxSaleDurationDays} days` 
    };
  }
  
  return { isCompliant: true, message: 'Sale duration complies with regulations' };
}

/**
 * Checks if sales are happening too frequently
 */
async function checkSalesFrequency(shop: string, productId: string, variantId: string) {
  // Get price history for the last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const priceHistory = await prisma.priceHistory.findMany({
    where: {
      shop,
      productId,
      variantId,
      timestamp: { gte: sixMonthsAgo }
    },
    orderBy: { timestamp: 'asc' }
  });
  
  if (priceHistory.length < 2) {
    return { isCompliant: true, message: 'Not enough price history to evaluate sales frequency' };
  }
  
  // Detect sales periods
  let salesPeriods = [];
  let currentSale = null;
  
  for (let i = 0; i < priceHistory.length; i++) {
    const entry = priceHistory[i];
    const isOnSale = entry.compareAtPrice && entry.price < entry.compareAtPrice;
    
    if (isOnSale && !currentSale) {
      // Start of a new sale
      currentSale = { start: entry.timestamp, end: entry.timestamp };
    } else if (isOnSale && currentSale) {
      // Continuing sale
      currentSale.end = entry.timestamp;
    } else if (!isOnSale && currentSale) {
      // End of a sale
      salesPeriods.push(currentSale);
      currentSale = null;
    }
  }
  
  // Don't forget to add the last sale if still ongoing
  if (currentSale) {
    salesPeriods.push(currentSale);
  }
  
  if (salesPeriods.length <= 1) {
    return { isCompliant: true, message: 'Only one sale period detected' };
  }
  
  // Check time between sales
  for (let i = 1; i < salesPeriods.length; i++) {
    const previousSaleEnd = new Date(salesPeriods[i-1].end);
    const currentSaleStart = new Date(salesPeriods[i].start);
    
    const daysBetweenSales = Math.floor((currentSaleStart.getTime() - previousSaleEnd.getTime()) / (1000 * 60 * 60 * 24));
    
    // Norwegian regulations typically require a significant period between sales (often 4-6 weeks)
    const minDaysBetweenSales = 28; // 4 weeks
    
    if (daysBetweenSales < minDaysBetweenSales) {
      return { 
        isCompliant: false, 
        message: `Only ${daysBetweenSales} days between sales, which is less than the minimum ${minDaysBetweenSales} days required` 
      };
    }
  }
  
  return { isCompliant: true, message: 'Sales frequency complies with regulations' };
}

/**
 * Gets the compliance status for a specific product variant
 */
export async function getProductComplianceStatus(shop: string, productId: string, variantId: string) {
  try {
    // Check if we have a compliance record for this product
    const compliance = await prisma.productCompliance.findUnique({
      where: { shop_productId_variantId: { shop, productId, variantId } }
    });
    
    if (!compliance) {
      // No compliance record yet, check it now
      return await checkProductCompliance(shop, productId, variantId);
    }
    
    return {
      success: true,
      isCompliant: compliance.isCompliant,
      isOnSale: compliance.isOnSale,
      issues: compliance.issues ? JSON.parse(compliance.issues) : [],
      referencePrice: compliance.referencePrice,
      lastChecked: compliance.lastChecked
    };
  } catch (error) {
    console.error(`Error getting compliance status for product ${productId}/${variantId}:`, error);
    return { success: false, error: error.message };
  }
}