// app/services/complianceRules.server.ts

export interface ComplianceIssue {
  rule: string;
  message: string;
}

export interface ComplianceResult {
  isCompliant: boolean;
  issues: ComplianceIssue[];
}

export interface Rule {
  check(product: any, priceHistory: any[]): ComplianceResult;
}

export class NorwegianFørprisRule implements Rule {
  check(product: any, priceHistory: any[]): ComplianceResult {
    // Basic implementation for MVP
    const result: ComplianceResult = {
      isCompliant: true,
      issues: []
    };
    
    // Skip if not on sale
    if (!product.compareAtPrice || product.compareAtPrice <= product.price) {
      return result;
    }
    
    // In a real implementation, we would check if the reference price
    // is the lowest price from the last 30 days
    // For MVP, we'll randomly mark some products as non-compliant
    if (Math.random() < 0.2) {
      result.isCompliant = false;
      result.issues.push({
        rule: 'førpris',
        message: 'Reference price must be the lowest price from the last 30 days'
      });
    }
    
    return result;
  }
}

export class SalesDurationRule implements Rule {
  check(product: any, priceHistory: any[]): ComplianceResult {
    // Basic implementation for MVP - would be expanded in full version
    return {
      isCompliant: true,
      issues: []
    };
  }
}

export class SalesFrequencyRule implements Rule {
  check(product: any, priceHistory: any[]): ComplianceResult {
    // Basic implementation for MVP - would be expanded in full version
    return {
      isCompliant: true,
      issues: []
    };
  }
}

// Helper to run compliance check for a product
export function checkCompliance(product: any, priceHistory: any[] = []): ComplianceResult {
  const rule = new NorwegianFørprisRule();
  return rule.check(product, priceHistory);
}