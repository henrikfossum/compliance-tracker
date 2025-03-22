// app/services/priceTracker.server.ts
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function trackPricesForShop(session: any) {
  const { shop } = session;
  
  try {
    console.log(`Starting price tracking for shop: ${shop}`);
    
    // Get the admin API client
    const { admin } = await authenticate.admin(session);
    
    // Use GraphQL to get all products with their variants (limit to 10 for MVP)
    const response = await admin.graphql(`
      {
        products(first: 10) {
          edges {
            node {
              id
              title
              variants(first: 10) {
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
    let productsTracked = 0;
    
    // Process each product
    for (const productEdge of products) {
      const product = productEdge.node;
      const productId = product.id.replace('gid://shopify/Product/', '');
      
      // Process each variant
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
        const price = parseFloat(variant.price);
        const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;
        
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
        
        productsTracked++;
        
        // Run a simple compliance check (can expand this later)
        const isOnSale = compareAtPrice !== null && compareAtPrice > price;
        
        // Update compliance status
        await prisma.productCompliance.upsert({
          where: {
            shop_productId_variantId: {
              shop,
              productId,
              variantId
            }
          },
          update: {
            referencePrice: compareAtPrice,
            lastChecked: new Date(),
            isOnSale,
            isCompliant: true, // For MVP we'll say everything is compliant
          },
          create: {
            shop,
            productId,
            variantId,
            referencePrice: compareAtPrice,
            lastChecked: new Date(),
            isOnSale,
            isCompliant: true,
          }
        });
      }
    }
    
    // Update the last scan time for this shop
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { lastScan: new Date() },
      create: {
        shop,
        enabled: true,
        trackingFrequency: 12,
        lastScan: new Date(),
        countryRules: 'NO'
      }
    });
    
    console.log(`Price tracking completed for shop: ${shop}`);
    return { success: true, productsTracked };
  } catch (error) {
    console.error(`Error tracking prices for shop ${shop}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
  }
}

export async function trackProductPrice(session: any, productId: string, variantId: string) {
  const { shop } = session;
  
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
    
    return { success: true, price, compareAtPrice };
  } catch (error) {
    console.error(`Error tracking product price (${productId}/${variantId}):`, error);
    return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
  }
}