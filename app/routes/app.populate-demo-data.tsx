// app/routes/app.populate-demo-data.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Button, Banner, BlockStack, InlineStack, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Define response types for better TypeScript support
type SuccessResponse = {
  success: true;
  productsProcessed: number;
  message: string;
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ActionResponse = SuccessResponse | ErrorResponse;

// Define a type for our loader data
type LoaderData = {
  ready: boolean;
};

// Add a loader function to ensure we have authentication before the page loads
export async function loader({ request }: LoaderFunctionArgs) {
  // Authenticate the request before showing the page
  await authenticate.admin(request);
  
  // Return minimal data, we don't need anything special for the page
  return json<LoaderData>({ ready: true });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Get a fully authenticated admin client and session
    const { admin, session } = await authenticate.admin(request);
    
    // Make sure we have a shop to work with
    if (!session || !session.shop) {
      return json<ErrorResponse>({
        success: false,
        error: "Authentication failed. Please refresh the page and try again."
      });
    }
    
    const shop = session.shop;
    
    // Use a try-catch inside the main function to catch GraphQL errors
    try {
      // 1. Get a few products from the shop
      const response = await admin.graphql(`
        {
          products(first: 5) {
            edges {
              node {
                id
                title
                variants(first: 1) {
                  edges {
                    node {
                      id
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
      
      if (products.length === 0) {
        return json<ErrorResponse>({
          success: false,
          error: "No products found in your store. Please create some products first."
        });
      }
      
      // 2. Create compliance data for each product
      let productsProcessed = 0;
      
      for (const productEdge of products) {
        const product = productEdge.node;
        const productId = product.id.replace('gid://shopify/Product/', '');
        
        const variant = product.variants.edges[0]?.node;
        if (!variant) continue;
        
        const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
        const price = parseFloat(variant.price);
        const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : price * 1.5;
        
        // Create price history for the last 60 days
        const priceHistoryEntries = [];
        const now = new Date();
        
        // Initial higher price for 30 days
        for (let i = 60; i > 30; i--) {
          const entryDate = new Date(now);
          entryDate.setDate(now.getDate() - i);
          
          priceHistoryEntries.push({
            shop,
            productId,
            variantId,
            price: compareAtPrice,
            compareAtPrice: null,
            timestamp: entryDate,
            isReference: i === 31 // Mark the last day of higher price as reference
          });
        }
        
        // Sale price for last 30 days
        for (let i = 30; i > 0; i--) {
          const entryDate = new Date(now);
          entryDate.setDate(now.getDate() - i);
          
          priceHistoryEntries.push({
            shop,
            productId,
            variantId,
            price: price,
            compareAtPrice: compareAtPrice,
            timestamp: entryDate,
            isReference: false
          });
        }
        
        // Current day price
        priceHistoryEntries.push({
          shop,
          productId,
          variantId,
          price: price,
          compareAtPrice: compareAtPrice,
          timestamp: now,
          isReference: false
        });
        
        // Create price history records
        await prisma.priceHistory.createMany({
          data: priceHistoryEntries
        });
        
        // Create or update compliance status
        const saleStartDate = new Date(now);
        saleStartDate.setDate(now.getDate() - 30);
        
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
            lastChecked: now,
            isOnSale: true,
            saleStartDate,
            isCompliant: true,
            issues: "[]"
          },
          create: {
            shop,
            productId,
            variantId,
            referencePrice: compareAtPrice,
            lastChecked: now,
            isOnSale: true,
            saleStartDate,
            isCompliant: true,
            issues: "[]"
          }
        });
        
        productsProcessed++;
      }
      
      // 3. Create shop settings if not exists
      await prisma.shopSettings.upsert({
        where: { shop },
        update: {
          enabled: true,
          trackingFrequency: 12,
          lastScan: new Date(),
          countryRules: "NO"
        },
        create: {
          shop,
          enabled: true,
          trackingFrequency: 12,
          lastScan: new Date(),
          countryRules: "NO"
        }
      });
      
      return json<SuccessResponse>({
        success: true,
        productsProcessed,
        message: `Successfully created demo data for ${productsProcessed} products.`
      });
    } catch (graphqlErrorUnknown) {
      console.error("GraphQL error:", graphqlErrorUnknown);
      
      // Use proper type narrowing for the error
      const graphqlError = graphqlErrorUnknown as Error;
      
      // Check for authentication issues
      if (graphqlError.message && graphqlError.message.includes("unauthorized")) {
        return json<ErrorResponse>({
          success: false,
          error: "Authentication error: You may need to reinstall the app or check permissions."
        });
      }
      
      return json<ErrorResponse>({
        success: false,
        error: graphqlError.message || "Error querying products"
      });
    }
  } catch (errorUnknown) {
    console.error("Error creating demo data:", errorUnknown);
    
    // Use proper type narrowing for the error
    const error = errorUnknown as Error;
    
    // If it's an authentication error, redirect to auth
    if (error.message && error.message.includes("authenticate")) {
      return redirect("/auth?shop=" + new URL(request.url).searchParams.get("shop"));
    }
    
    return json<ErrorResponse>({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
};

export default function PopulateDemoData() {
  // Make sure we use the loader data to confirm we're authenticated
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  
  return (
    <Page>
      <TitleBar title="Create Demo Compliance Data" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Populate Demo Compliance Data</Text>
              
              <Text as="p" variant="bodyMd">
                This will create sample compliance records and price history for up to 5 products in your store.
                Use this to test the compliance widget on your product pages.
              </Text>
              
              <Text as="p" variant="bodyMd">
                For demo purposes, all products will be marked as:
                <ul>
                  <li>On sale for the last 30 days</li>
                  <li>Having a reference price (before sale) for the 30 days prior</li>
                  <li>Compliant with Norwegian regulations</li>
                </ul>
              </Text>
              
              {/* Type narrowing with conditional checks */}
              {actionData?.success === true && (
                <Banner tone="success">
                  {actionData.message}
                </Banner>
              )}
              
              {actionData?.success === false && (
                <Banner tone="critical">
                  Error: {actionData.error}
                </Banner>
              )}
              
              <InlineStack gap="300">
                <Form method="post">
                  <Button
                    variant="primary"
                    loading={isLoading}
                    disabled={isLoading}
                    submit
                  >
                    {isLoading ? "Creating demo data..." : "Create Demo Data"}
                  </Button>
                </Form>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}