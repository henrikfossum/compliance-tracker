// app/services/complianceRules.server.ts

export interface ComplianceIssue {
  rule: string;
  message: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  issues: ComplianceIssue[];
}

export interface PriceHistoryEntry {
  timestamp: Date;
  price: number;
  compareAtPrice: number | null;
  isReference?: boolean;
}

export interface ProductData {
  shop: string;
  productId: string;
  variantId: string;
  price: number;
  compareAtPrice: number | null;
  saleStartDate?: Date;
  isOnSale: boolean;
}

export interface Rule {
  check(product: ProductData, priceHistory: PriceHistoryEntry[]): ComplianceResult;
}

/**
 * Førpris Rule - Norwegian regulation that requires reference prices
 * to be the lowest price used in the 30 days before a sale starts.
 */
export class NorwegianFørprisRule implements Rule {
  check(product: ProductData, priceHistory: PriceHistoryEntry[]): ComplianceResult {
    // Skip if not on sale
    if (!product.isOnSale || !product.compareAtPrice) {
      return { isCompliant: true, issues: [] };
    }
    
    const result: ComplianceResult = {
      isCompliant: true,
      issues: []
    };
    
    // Determine sale start date
    const saleStartDate = product.saleStartDate || this.findSaleStartDate(priceHistory);
    if (!saleStartDate) {
      // If we can't determine when the sale started, assume it's compliant
      return result;
    }
    
    // Get price history for 30 days before sale started
    const thirtyDaysBefore = new Date(saleStartDate);
    thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);
    
    const preSalePrices = priceHistory
      .filter(entry => 
        entry.timestamp < saleStartDate && 
        entry.timestamp >= thirtyDaysBefore
      )
      .map(entry => entry.price);
    
    // If no price history before sale, we can't verify compliance
    if (preSalePrices.length === 0) {
      return result;
    }
    
    // Find lowest price in the 30 days before the sale
    const lowestPrice = Math.min(...preSalePrices);
    
    // If reference price is higher than lowest price in the 30 days before sale, it's non-compliant
    if (product.compareAtPrice > lowestPrice) {
      result.isCompliant = false;
      result.issues.push({
        rule: 'førpris',
        message: `Reference price (${product.compareAtPrice.toFixed(2)}) is higher than the lowest price (${lowestPrice.toFixed(2)}) from the 30 days before the sale started`
      });
    }
    
    return result;
  }
  
  private findSaleStartDate(priceHistory: PriceHistoryEntry[]): Date | null {
    if (priceHistory.length < 2) return null;
    
    // Sort by timestamp ascending
    const sortedHistory = [...priceHistory].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    // Loop through history to find when sale started (when compareAtPrice first appeared)
    for (let i = 1; i < sortedHistory.length; i++) {
      const prevEntry = sortedHistory[i-1];
      const currEntry = sortedHistory[i];
      
      // If previous entry has no compareAtPrice but current one does, this is when sale started
      if (
        (!prevEntry.compareAtPrice || prevEntry.compareAtPrice <= prevEntry.price) &&
        (currEntry.compareAtPrice && currEntry.compareAtPrice > currEntry.price)
      ) {
        return currEntry.timestamp;
      }
    }
    
    // If we can't find it, use the timestamp of the first entry with a compareAtPrice
    const firstSaleEntry = sortedHistory.find(entry => 
      entry.compareAtPrice && entry.compareAtPrice > entry.price
    );
    
    return firstSaleEntry?.timestamp || null;
  }
}

/**
 * Sale Duration Rule - Sales shouldn't last longer than 30% of the year (~110 days)
 */
export class SaleDurationRule implements Rule {
  check(product: ProductData, priceHistory: PriceHistoryEntry[]): ComplianceResult {
    // Skip if not on sale
    if (!product.isOnSale || !product.compareAtPrice) {
      return { isCompliant: true, issues: [] };
    }
    
    const result: ComplianceResult = {
      isCompliant: true,
      issues: []
    };
    
    // Determine sale start date
    const saleStartDate = product.saleStartDate || this.findSaleStartDate(priceHistory);
    if (!saleStartDate) {
      // If we can't determine when the sale started, assume it's compliant
      return result;
    }
    
    // Calculate sale duration in days
    const now = new Date();
    const saleDurationDays = Math.ceil(
      (now.getTime() - saleStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // If sale has lasted more than 110 days (30% of the year), it's non-compliant
    if (saleDurationDays > 110) {
      result.isCompliant = false;
      result.issues.push({
        rule: 'saleDuration',
        message: `Sale has been running for ${saleDurationDays} days, which exceeds the recommended maximum of 110 days (30% of the year)`
      });
    }
    
    return result;
  }
  
  private findSaleStartDate(priceHistory: PriceHistoryEntry[]): Date | null {
    if (priceHistory.length < 2) return null;
    
    // Sort by timestamp ascending
    const sortedHistory = [...priceHistory].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    // Loop through history to find when sale started (when compareAtPrice first appeared)
    for (let i = 1; i < sortedHistory.length; i++) {
      const prevEntry = sortedHistory[i-1];
      const currEntry = sortedHistory[i];
      
      // If previous entry has no compareAtPrice but current one does, this is when sale started
      if (
        (!prevEntry.compareAtPrice || prevEntry.compareAtPrice <= prevEntry.price) &&
        (currEntry.compareAtPrice && currEntry.compareAtPrice > currEntry.price)
      ) {
        return currEntry.timestamp;
      }
    }
    
    // If we can't find it, use the timestamp of the first entry with a compareAtPrice
    const firstSaleEntry = sortedHistory.find(entry => 
      entry.compareAtPrice && entry.compareAtPrice > entry.price
    );
    
    return firstSaleEntry?.timestamp || null;
  }
}

/**
 * Sales Frequency Rule - A sufficient period should pass between sales
 */
export class SalesFrequencyRule implements Rule {
  check(product: ProductData, priceHistory: PriceHistoryEntry[]): ComplianceResult {
    // Skip if not on sale
    if (!product.isOnSale || !product.compareAtPrice) {
      return { isCompliant: true, issues: [] };
    }
    
    const result: ComplianceResult = {
      isCompliant: true,
      issues: []
    };
    
    // Find all sales periods
    const salesPeriods = this.findSalesPeriods(priceHistory);
    
    // If there's only one sales period, it's compliant
    if (salesPeriods.length <= 1) {
      return result;
    }
    
    // Sort by start date
    salesPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    // Check gaps between sales periods
    for (let i = 1; i < salesPeriods.length; i++) {
      const prevPeriod = salesPeriods[i-1];
      const currPeriod = salesPeriods[i];
      
      // Calculate days between sales
      const daysBetween = Math.ceil(
        (currPeriod.start.getTime() - prevPeriod.end.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // If less than 30 days between sales, it's non-compliant
      if (daysBetween < 30) {
        result.isCompliant = false;
        result.issues.push({
          rule: 'saleFrequency',
          message: `Only ${daysBetween} days between sale periods. Norwegian guidelines recommend at least 30 days between sales.`
        });
        break; // One issue is enough
      }
    }
    
    return result;
  }
  
  private findSalesPeriods(priceHistory: PriceHistoryEntry[]): Array<{start: Date, end: Date}> {
    if (priceHistory.length < 2) return [];
    
    // Sort by timestamp ascending
    const sortedHistory = [...priceHistory].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    const salesPeriods: Array<{start: Date, end: Date}> = [];
    let currentPeriod: {start: Date, end: Date} | null = null;
    
    // Loop through history to find sale periods
    for (const entry of sortedHistory) {
      const isOnSale = entry.compareAtPrice && entry.compareAtPrice > entry.price;
      
      if (isOnSale && !currentPeriod) {
        // Start of a new sale period
        currentPeriod = {
          start: entry.timestamp,
          end: entry.timestamp
        };
      } else if (isOnSale && currentPeriod) {
        // Continuing sale period
        currentPeriod.end = entry.timestamp;
      } else if (!isOnSale && currentPeriod) {
        // End of a sale period
        salesPeriods.push(currentPeriod);
        currentPeriod = null;
      }
    }
    
    // Add the current period if it's still ongoing
    if (currentPeriod) {
      salesPeriods.push(currentPeriod);
    }
    
    return salesPeriods;
  }
}

/**
 * Run a complete compliance check using all applicable rules
 */
export async function checkProductCompliance(
  product: ProductData, 
  priceHistory: PriceHistoryEntry[]
): Promise<ComplianceResult> {
  const rules: Rule[] = [
    new NorwegianFørprisRule(),
    new SaleDurationRule(),
    new SalesFrequencyRule()
  ];
  
  const result: ComplianceResult = {
    isCompliant: true,
    issues: []
  };
  
  for (const rule of rules) {
    const ruleResult = rule.check(product, priceHistory);
    
    if (!ruleResult.isCompliant) {
      result.isCompliant = false;
      result.issues.push(...ruleResult.issues);
    }
  }
  
  return result;
}

/**
 * Run bulk compliance checks for multiple products
 */
export async function bulkCheckCompliance(
  shop: string,
  productsWithHistory: Array<{
    product: ProductData,
    priceHistory: PriceHistoryEntry[]
  }>
): Promise<Array<{
  productId: string,
  variantId: string,
  result: ComplianceResult
}>> {
  const results = [];
  
  for (const { product, priceHistory } of productsWithHistory) {
    const result = await checkProductCompliance(product, priceHistory);
    
    results.push({
      productId: product.productId,
      variantId: product.variantId,
      result
    });
  }
  
  return results;
}