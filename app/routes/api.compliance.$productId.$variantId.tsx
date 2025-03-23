// app/routes/api.compliance.$productId.$variantId.ts
// Note: This is the correct path that matches the App Proxy config
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { productId, variantId } = params;
  
  if (!productId || !variantId) {
    return json({ success: false, error: "Product ID and Variant ID are required" }, { status: 400 });
  }
  
  try {
    // Get the shop from query params - App Proxy always includes this
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || "";
    
    if (!shop) {
      return json({ success: false, error: "Shop parameter is required" }, { status: 400 });
    }

    // For debugging - log values
    console.log("API Request:", {
      shop,
      productId,
      variantId,
      url: request.url
    });

    // Look up data in database
    const productCompliance = await prisma.productCompliance.findUnique({
      where: {
        shop_productId_variantId: {
          shop,
          productId,
          variantId
        }
      }
    });
    
    // Get price history for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const priceHistory = await prisma.priceHistory.findMany({
      where: {
        shop,
        productId,
        variantId,
        timestamp: {
          gte: thirtyDaysAgo
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    });
    
    // If no data, create mock data for demo
    if (!productCompliance) {
      // Mock data for demonstration
      const mockData = {
        success: true,
        isCompliant: true,
        isOnSale: true,
        referencePrice: 149.99,
        currentPrice: 99.99,
        lowestPrice30Days: 99.99,
        saleStartDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        issues: [],
        priceHistory: [
          { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), price: 149.99 },
          { date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), price: 149.99 },
          { date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), price: 99.99 }
        ]
      };
      
      return json(mockData);
    }
    
    // Format real data
    return json({
      success: true,
      isCompliant: productCompliance.isCompliant,
      isOnSale: productCompliance.isOnSale,
      referencePrice: productCompliance.referencePrice,
      saleStartDate: productCompliance.saleStartDate,
      lastChecked: productCompliance.lastChecked,
      issues: productCompliance.issues ? JSON.parse(productCompliance.issues) : [],
      priceHistory: priceHistory.map(entry => ({
        date: entry.timestamp,
        price: entry.price,
        compareAtPrice: entry.compareAtPrice
      }))
    });
  } catch (error) {
    console.error("Error fetching compliance data:", error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
};