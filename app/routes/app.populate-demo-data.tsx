// app/routes/app.populate-demo-data.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Button, Banner, BlockStack, InlineStack, Text, Select, Checkbox } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState } from "react";


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
  products?: Array<{
    id: string;
    title: string;
    variants: Array<{
      id: string;
      title: string;
      price: number;
    }>;
  }>;
};

// Add a loader function to ensure we have authentication before the page loads
export async function loader({ request }: LoaderFunctionArgs) {
  // Authenticate the request before showing the page
  const { admin } = await authenticate.admin(request);
  
  // Get a list of products to let the user choose which ones to populate
  try {
    const response = await admin.graphql(`
      {
        products(first: 10) {
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }
    `);
    
    const responseJson = await response.json();
    const productEdges = responseJson.data?.products?.edges || [];
    
    const products = productEdges.map((edge: any) => {
      const product = edge.node;
      return {
        id: product.id.replace('gid://shopify/Product/', ''),
        title: product.title,
        variants: product.variants.edges.map((variantEdge: any) => {
          const variant = variantEdge.node;
          return {
            id: variant.id.replace('gid://shopify/ProductVariant/', ''),
            title: variant.title,
            price: parseFloat(variant.price)
          };
        })
      };
    });
    
    return json<LoaderData>({ 
      ready: true,
      products
    });
  } catch (error) {
    console.error("Error fetching products", error);
    return json<LoaderData>({ ready: true });
  }
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
    const formData = await request.formData();
    const scenarioType = formData.get("scenarioType") as string || "compliant";
    
    // Use a try-catch inside the main function to catch GraphQL errors
    try {
      // 1. Get products from the shop
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
        
        // Price values will vary based on scenario type
        let initialPrice = price; // The price before any sales
        let salePrice = price * 0.7; // 30% discount for sale price
        let compareAtPrice: number;
        
        // Dates will also vary based on scenario
        const now = new Date();
        let saleStartDate = new Date(now);
        
        // Generate different types of compliance scenarios
        let isCompliant = true;
        let issues: Array<{rule: string, message: string}> = [];
        
        switch (scenarioType) {
          case "non_compliant_reference":
            // Scenario: Reference price is higher than the price used in the 30 days before sale
            // This violates the Norwegian førpris regulation
            saleStartDate.setDate(now.getDate() - 30); // Sale started 30 days ago
            compareAtPrice = initialPrice * 1.5; // Reference price 50% higher than normal
            isCompliant = false;
            issues.push({
              rule: "førpris",
              message: "Reference price is higher than the lowest price from the 30 days before the sale"
            });
            break;
            
          case "non_compliant_duration":
            // Scenario: Sale has been running too long (over 110 days)
            saleStartDate.setDate(now.getDate() - 120); // Sale started 120 days ago
            compareAtPrice = initialPrice * 1.2; // 20% higher reference price
            isCompliant = false;
            issues.push({
              rule: "saleDuration",
              message: "Sale has been running for more than 110 days (30% of the year)"
            });
            break;
            
          case "non_compliant_frequency":
            // Scenario: Sale happens too frequently
            saleStartDate.setDate(now.getDate() - 15); // Current sale started 15 days ago
            compareAtPrice = initialPrice * 1.2;
            isCompliant = false;
            issues.push({
              rule: "saleFrequency",
              message: "Product is on sale too frequently - multiple sales within a short period"
            });
            break;
            
          case "compliant":
          default:
            // Scenario: Fully compliant with regulations
            saleStartDate.setDate(now.getDate() - 15); // Sale started 15 days ago
            compareAtPrice = initialPrice * 1.2; // 20% higher reference price
            isCompliant = true;
            break;
        }
        
        // Create price history for the last 90 days
        const priceHistoryEntries = [];
        
        // Regular price period (days 90-31 before today)
        for (let i = 90; i > 30; i--) {
          const entryDate = new Date(now);
          entryDate.setDate(now.getDate() - i);
          
          // For non-compliant reference price scenario, show a lower price in the reference period
          const historyPrice = scenarioType === "non_compliant_reference" 
            ? initialPrice * 0.9 // 10% lower than normal during reference period
            : initialPrice;
          
          priceHistoryEntries.push({
            shop,
            productId,
            variantId,
            price: historyPrice,
            compareAtPrice: null,
            timestamp: entryDate,
            isReference: i === 31 // Mark the last day of regular price as reference
          });
        }
        
        // Sale period (from sale start to now)
        for (let i = 30; i >= 0; i--) {
          // Only include in sale period if the day is after sale start
          const entryDate = new Date(now);
          entryDate.setDate(now.getDate() - i);
          
          // Check if this date is after sale start
          if (entryDate >= saleStartDate) {
            priceHistoryEntries.push({
              shop,
              productId,
              variantId,
              price: salePrice,
              compareAtPrice: compareAtPrice,
              timestamp: entryDate,
              isReference: false
            });
          } else {
            // Before sale start, still regular price
            priceHistoryEntries.push({
              shop,
              productId,
              variantId,
              price: initialPrice,
              compareAtPrice: null,
              timestamp: entryDate,
              isReference: false
            });
          }
        }
        
        // Create price history records
        await prisma.priceHistory.createMany({
          data: priceHistoryEntries
        });
        
        // Create or update compliance status
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
            isCompliant,
            issues: JSON.stringify(issues)
          },
          create: {
            shop,
            productId,
            variantId,
            referencePrice: compareAtPrice,
            lastChecked: now,
            isOnSale: true,
            saleStartDate,
            isCompliant,
            issues: JSON.stringify(issues)
          }
        });
        
        // For non-compliant frequency scenario, add an additional past sale period
        if (scenarioType === "non_compliant_frequency") {
          // Add a previous sale that ended just 15 days before the current one started
          const prevSaleEnd = new Date(saleStartDate);
          prevSaleEnd.setDate(prevSaleEnd.getDate() - 15);
          
          const prevSaleStart = new Date(prevSaleEnd);
          prevSaleStart.setDate(prevSaleEnd.getDate() - 30);
          
          const prevSaleHistoryEntries = [];
          
          // Previous sale period entries
          for (let date = new Date(prevSaleStart); date <= prevSaleEnd; date.setDate(date.getDate() + 1)) {
            prevSaleHistoryEntries.push({
              shop,
              productId,
              variantId,
              price: salePrice,
              compareAtPrice: compareAtPrice,
              timestamp: new Date(date),
              isReference: false
            });
          }
          
          // Create previous sale history records
          await prisma.priceHistory.createMany({
            data: priceHistoryEntries
          });
        }
        
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
      
      // Create default compliance rules if they don't exist
      const existingRules = await prisma.complianceRule.count({
        where: { countryCode: "NO" }
      });
      
      if (existingRules === 0) {
        await prisma.complianceRule.createMany({
          data: [
            {
              countryCode: "NO",
              ruleType: "førpris",
              parameters: JSON.stringify({
                minDays: 30,
                requireLowestPrice: true
              }),
              description: "Reference price must be the lowest price from the last 30 days",
              active: true
            },
            {
              countryCode: "NO",
              ruleType: "saleDuration",
              parameters: JSON.stringify({
                maxDays: 110
              }),
              description: "Sales should not last more than 30% of the year (110 days)",
              active: true
            },
            {
              countryCode: "NO",
              ruleType: "saleFrequency",
              parameters: JSON.stringify({
                minDaysBetweenSales: 30
              }),
              description: "A sufficient period must pass between sales of the same product",
              active: true
            }
          ]
        });
      }
      
      return json<SuccessResponse>({
        success: true,
        productsProcessed,
        message: `Successfully created ${scenarioType} demo data for ${productsProcessed} products.`
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
  
  // State for scenario selection
  const [scenarioType, setScenarioType] = useState("compliant");
  
  return (
    <Page>
      <TitleBar title="Create Demo Compliance Data" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Populate Demo Compliance Data</Text>
              
              <Text as="p" variant="bodyMd">
                This will create sample compliance records and price history for your products.
                Use this to test the compliance widget on your product pages and dashboard features.
              </Text>
              
              <Select
                label="Choose a compliance scenario"
                options={[
                  {label: "Compliant (all regulations met)", value: "compliant"},
                  {label: "Non-compliant Reference Price", value: "non_compliant_reference"},
                  {label: "Non-compliant Sale Duration", value: "non_compliant_duration"},
                  {label: "Non-compliant Sale Frequency", value: "non_compliant_frequency"}
                ]}
                value={scenarioType}
                onChange={setScenarioType}
                helpText="This determines the type of compliance data that will be generated."
              />
              
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Scenario Details:</Text>
                
                {scenarioType === "compliant" && (
                  <Banner tone="success">
                    <p>Products will be marked as compliant with Norwegian regulations:</p>
                    <ul>
                      <li>Proper reference prices (førpris)</li>
                      <li>Appropriate sale duration (15 days)</li>
                      <li>No frequency issues</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "non_compliant_reference" && (
                  <Banner tone="warning">
                    <p>Products will have <strong>reference price issues</strong>:</p>
                    <ul>
                      <li>Reference price higher than prices from the 30 days before sale</li>
                      <li>This violates the Norwegian førpris regulation</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "non_compliant_duration" && (
                  <Banner tone="warning">
                    <p>Products will have <strong>sale duration issues</strong>:</p>
                    <ul>
                      <li>Sales running for 120 days (exceeds the 110 day guideline)</li>
                      <li>This violates the Norwegian duration guidelines</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "non_compliant_frequency" && (
                  <Banner tone="warning">
                    <p>Products will have <strong>sale frequency issues</strong>:</p>
                    <ul>
                      <li>Multiple sale periods within a short timeframe</li>
                      <li>Only 15 days between sales (should be at least 30)</li>
                    </ul>
                  </Banner>
                )}
              </BlockStack>
              
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
                  <input type="hidden" name="scenarioType" value={scenarioType} />
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