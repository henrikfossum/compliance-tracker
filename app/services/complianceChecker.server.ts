// app/services/complianceChecker.server.ts
import prisma from "../db.server";

export async function getProductComplianceStatus(shop: string, productId: string, variantId: string) {
  try {
    // Check if we have a compliance record for this product
    const compliance = await prisma.productCompliance.findUnique({
      where: { 
        shop_productId_variantId: {
          shop, 
          productId, 
          variantId
        }
      }
    });
    
    if (!compliance) {
      return { 
        success: false, 
        error: 'No compliance data found for this product'
      };
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
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "An unknown error occurred"
    };
  }
}