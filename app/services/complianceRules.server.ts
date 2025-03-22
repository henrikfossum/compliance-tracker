// app/services/complianceRules.server.ts
export interface Rule {
    check(product: any, priceHistory: any[]): ComplianceResult;
  }
  
  export class NorwegianFørprisRule implements Rule {
    check(product: any, priceHistory: any[]): ComplianceResult {
      // Check if førpris is the lowest price in the last 30 days
      // Return compliance status and issues
    }
  }
  
  export class SalesDurationRule implements Rule {
    check(product: any, priceHistory: any[]): ComplianceResult {
      // Check if the sale has been running too long
      // Return compliance status and issues
    }
  }
  
  export class SalesFrequencyRule implements Rule {
    check(product: any, priceHistory: any[]): ComplianceResult {
      // Check if sales are too frequent
      // Return compliance status and issues
    }
  }