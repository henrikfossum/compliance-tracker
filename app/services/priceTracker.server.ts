// app/services/priceTracker.server.ts
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { checkProductCompliance } from "./complianceChecker.server";

/**
 * Tracks prices for all products in a shop
 */
export async function trackPricesForShop(session: any) {
  const { shop, accessToken } = session;
  
  try {
    console.log(`Starting price tracking for shop: ${shop}`);
    
    // Get the admin API client
    const { admin } = await authenticate.admin(session);
    
    // Use GraphQL to get all products with their variants
    const response = await admin.graphql(`
      {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
        }
      }
    `);
    
    const responseJson = await response.json();
    const products = responseJson.data?.products?.edges || [];
    
    console.log(`Found ${products.length} products to track`);
    
    // Process each product
    for (const productEdge of products) {
      const product = productEdge.node;
      const productId = product.id.replace('gid://shopify/Product/', '');
      const productTitle = product.title;
      
      // Process each variant
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
        const price = parseFloat(variant.price);
        const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;
        
        console.log(`Tracking price for ${productTitle} - ${variant.title}: ${price} (Compare at: ${compareAtPrice || 'N/A'})`);
        
        // Record current price in history
        await prisma.priceHistory.create({
          data: {
            shop,
            productId,
            variantId,
            price,
            compareAtPrice,
          }
        });
        
        // Check compliance for this product variant
        await checkProductCompliance(shop, productId, variantId);
      }
    }
    
    // Update the last scan time for this shop
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { lastScan: new Date() },
      create: {
        shop,
        enabled: true,
        trackingFrequency: 12, // Default to checking every 12 hours
        lastScan: new Date(),
        countryRules: 'NO' // Default to Norwegian rules
      }
    });
    
    console.log(`Price tracking completed for shop: ${shop}`);
    return { success: true, productsTracked: products.length };
  } catch (error) {
    console.error(`Error tracking prices for shop ${shop}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Tracks price for a specific product variant
 */
export async function trackProductPrice(session: any, productId: string, variantId: string) {
  const { shop, accessToken } = session;
  
  try {
    // Get the admin API client
    const { admin } = await authenticate.admin(session);
    
    // Use GraphQL to get the specific product variant
    const response = await admin.graphql(`
      {
        product(id: "gid://shopify/Product/${productId}") {
          title
          variant(id: "gid://shopify/ProductVariant/${variantId}") {
            title
            price
            compareAtPrice
          }
        }
      }
    `);
    
    const responseJson = await response.json();
    const product = responseJson.data?.product;
    
    if (!product || !product.variant) {
      throw new Error(`Product or variant not found: ${productId}/${variantId}`);
    }
    
    const price = parseFloat(product.variant.price);
    const compareAtPrice = product.variant.compareAtPrice ? parseFloat(product.variant.compareAtPrice) : null;
    
    // Record current price in history
    await prisma.priceHistory.create({
      data: {
        shop,
        productId,
        variantId,
        price,
        compareAtPrice,
      }
    });
    
    // Check compliance for this product variant
    await checkProductCompliance(shop, productId, variantId);
    
    return { success: true, price, compareAtPrice };
  } catch (error) {
    console.error(`Error tracking product price (${productId}/${variantId}):`, error);
    return { success: false, error: error.message };
  }
}