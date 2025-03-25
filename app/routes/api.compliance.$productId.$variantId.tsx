// app/routes/api.compliance.$productId.$variantId.tsx
export const handle = {
  isPublicRoute: true,
};

import { json, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { productId, variantId } = params;
  
  // Add CORS headers for cross-origin requests
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  
  // For preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers
    });
  }
  
  // Get shop from query params
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  
  // Log for debugging
  console.log(`API Request received for Shop: ${shop}, Product: ${productId}, Variant: ${variantId}`);
  
  // Always generate mock data so widget always works
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