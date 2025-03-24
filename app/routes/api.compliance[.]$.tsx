// app/routes/api.compliance[.]$.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  // Start with simple debug log
  console.log("CATCH-ALL ROUTE HIT", {
    url: request.url,
    params,
    wildcard: params["*"]
  });
  // Add CORS headers for cross-origin requests
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  
  // For preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers
    });
  }
  
  // Get the URL path and extract product/variant IDs regardless of order
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  
  // Get the path from the URL
  const path = url.pathname;
  console.log(`API Request received for path: ${path}, Shop: ${shop}`);
  
  // The "*" param in the catch-all route contains the rest of the path
  const restPath = params["*"] || "";
  console.log(`Rest path: ${restPath}`);
  
  // Parse path segments for IDs
  const pathSegments = path.split('/').filter(Boolean);
  let productId = '', variantId = '';
  
  // Check for single ID in path (common format: /api/compliance/42219462852689)
  if (pathSegments.length >= 3 && /^\d+$/.test(pathSegments[2])) {
    // If there's just one ID, assume it's the variant ID
    variantId = pathSegments[2];
    
    // Try to get product ID from query params if available
    const productIdParam = url.searchParams.get("productId");
    if (productIdParam && /^\d+$/.test(productIdParam)) {
      productId = productIdParam;
    }
    
    console.log(`Single ID path format detected. VariantId: ${variantId}, ProductId: ${productId}`);
  } 
  // Check for dual ID path format (common format: /api/compliance/7728459251793/42219462852689)
  else if (pathSegments.length >= 4 && /^\d+$/.test(pathSegments[2]) && /^\d+$/.test(pathSegments[3])) {
    productId = pathSegments[2];
    variantId = pathSegments[3];
    console.log(`Dual ID path format detected. ProductId: ${productId}, VariantId: ${variantId}`);
  }
  
  // If we still don't have the variant ID, check query params
  if (!variantId) {
    const variantIdParam = url.searchParams.get("variantId");
    if (variantIdParam && /^\d+$/.test(variantIdParam)) {
      variantId = variantIdParam;
      console.log(`Retrieved variantId from query params: ${variantId}`);
    }
  }
  
  // If we still don't have the product ID, check query params
  if (!productId) {
    const productIdParam = url.searchParams.get("productId");
    if (productIdParam && /^\d+$/.test(productIdParam)) {
      productId = productIdParam;
      console.log(`Retrieved productId from query params: ${productId}`);
    }
  }
  
  console.log(`Final parsed values - ProductId: ${productId || 'N/A'}, VariantId: ${variantId || 'N/A'}`);
  
  // Generate mock data even if we couldn't extract IDs properly
  const mockData = generateMockData();
  
  // Return mock data with CORS headers
  return json(mockData, {
    headers
  });
};

// Helper function to generate consistent mock data
function generateMockData() {
  const now = new Date();
  const days = 90;
  const saleStartDate = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000)); // 15 days ago
  
  const basePrice = 149.99;
  const salePrice = 99.99;
  
  // Generate mock price history for the last 90 days
  const mockPriceHistory = [];
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
    const dateString = date.toISOString().split('T')[0];
    
    // Before sale start - regular price
    if (date < saleStartDate) {
      mockPriceHistory.push({
        date: dateString,
        price: basePrice,
        compareAtPrice: null
      });
    } 
    // After sale start - sale price
    else {
      mockPriceHistory.push({
        date: dateString,
        price: salePrice,
        compareAtPrice: basePrice
      });
    }
  }
  
  return {
    success: true,
    isCompliant: true,
    isOnSale: true,
    referencePrice: basePrice,
    currentPrice: salePrice,
    saleStartDate: saleStartDate.toISOString(),
    lastChecked: now.toISOString(),
    issues: [],
    priceHistory: mockPriceHistory
  };
}