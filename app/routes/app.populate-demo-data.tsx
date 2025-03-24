// app/routes/app.populate-all-test-data.tsx
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { Page, Layout, Card, Button, Banner, BlockStack, InlineStack, Text, Select, ProgressBar } from "@shopify/polaris";
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

// Add a loader function to get a list of products
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  
  try {
    const response = await admin.graphql(`
      {
        products(first: 50) {
          edges {
            node {
              id
              title
              variants(first: 5) {
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
    const productEdges = responseJson.data?.products?.edges || [];
    
    const productsWithVariants = productEdges.map((edge: any) => {
      const product = edge.node;
      const productId = product.id.replace('gid://shopify/Product/', '');
      
      const variants = product.variants.edges.map((variantEdge: any) => {
        const variant = variantEdge.node;
        return {
          id: variant.id.replace('gid://shopify/ProductVariant/', ''),
          title: variant.title,
          price: parseFloat(variant.price),
          compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null
        };
      });
      
      return {
        id: productId,
        title: product.title,
        variants
      };
    });
    
    return json({
      products: productsWithVariants
    });
  } catch (error) {
    console.error("Error fetching products", error);
    return json({ 
      products: [],
      error: error instanceof Error ? error.message : "Failed to fetch products"
    });
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      return json<ErrorResponse>({
        success: false,
        error: "Authentication failed. Please refresh the page and try again."
      });
    }
    
    const shop = session.shop;
    const formData = await request.formData();
    const scenarioType = formData.get("scenarioType") as string || "mixed";
    
    // Get all products from the shop
    try {
      // Fetch all products from the shop (up to 100 for testing)
      const response = await admin.graphql(`
        {
          products(first: 100) {
            edges {
              node {
                id
                title
                variants(first: 10) {
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
      const productEdges = responseJson.data?.products?.edges || [];
      
      if (productEdges.length === 0) {
        return json<ErrorResponse>({
          success: false,
          error: "No products found in your store. Please create some products first."
        });
      }
      
      // Clear existing test data 
      await prisma.priceHistory.deleteMany({
        where: { shop }
      });
      
      await prisma.productCompliance.deleteMany({
        where: { shop }
      });
      
      // Create compliance rules if they don't exist
      const existingRules = await prisma.complianceRule.count();
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
      
      // Create shop settings
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
      
      // 2. Create compliance data for each product and variant
      let productsProcessed = 0;
      
      for (const productEdge of productEdges) {
        const product = productEdge.node;
        const productId = product.id.replace('gid://shopify/Product/', '');
        
        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node;
          const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
          const price = parseFloat(variant.price);
          
          // Different scenarios for different products to create a diverse test dataset
          // This creates a mix of compliant and non-compliant products
          let scenarioForThisProduct = scenarioType;
          
          // If mixed scenario, alternate between different scenarios
          if (scenarioType === "mixed") {
            const scenarioOptions = ["compliant", "non_compliant_reference", "non_compliant_duration", "non_compliant_frequency"];
            scenarioForThisProduct = scenarioOptions[productsProcessed % scenarioOptions.length];
          }
          
          // Create compliance and price history data
          await generateTestDataForProduct(
            shop, 
            productId, 
            variantId, 
            price, 
            scenarioForThisProduct
          );
          
          productsProcessed++;
        }
      }
      
      return json<SuccessResponse>({
        success: true,
        productsProcessed,
        message: `Successfully created test data for ${productsProcessed} product variants.`
      });
      
    } catch (graphqlError) {
      console.error("GraphQL error:", graphqlError);
      
      return json<ErrorResponse>({
        success: false,
        error: graphqlError instanceof Error ? graphqlError.message : "Error querying products"
      });
    }
  } catch (error) {
    console.error("Error creating test data:", error);
    
    return json<ErrorResponse>({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
};

// Helper function to generate test data for a product
async function generateTestDataForProduct(
  shop: string, 
  productId: string, 
  variantId: string, 
  currentPrice: number,
  scenarioType: string
) {
  // Price values will vary based on scenario type
  let initialPrice = currentPrice; // The price before any sales
  let salePrice = Math.round((currentPrice * 0.7) * 100) / 100; // 30% discount for sale price
  let compareAtPrice: number;
  
  // Default to on sale if we have a current compareAtPrice that is higher than the price
  const isOnSale = true;
  
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
      compareAtPrice = Math.round((initialPrice * 1.5) * 100) / 100; // Reference price 50% higher than normal
      isCompliant = false;
      issues.push({
        rule: "førpris",
        message: "Reference price is higher than the lowest price from the 30 days before the sale"
      });
      break;
      
    case "non_compliant_duration":
      // Scenario: Sale has been running too long (over 110 days)
      saleStartDate.setDate(now.getDate() - 120); // Sale started 120 days ago
      compareAtPrice = Math.round((initialPrice * 1.2) * 100) / 100; // 20% higher reference price
      isCompliant = false;
      issues.push({
        rule: "saleDuration",
        message: "Sale has been running for more than 110 days (30% of the year)"
      });
      break;
      
    case "non_compliant_frequency":
      // Scenario: Sale happens too frequently
      saleStartDate.setDate(now.getDate() - 15); // Current sale started 15 days ago
      compareAtPrice = Math.round((initialPrice * 1.2) * 100) / 100;
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
      compareAtPrice = Math.round((initialPrice * 1.2) * 100) / 100; // 20% higher reference price
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
      ? Math.round((initialPrice * 0.9) * 100) / 100 // 10% lower than normal during reference period
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
    let currentDate = new Date(prevSaleStart);
    while (currentDate <= prevSaleEnd) {
      prevSaleHistoryEntries.push({
        shop,
        productId,
        variantId,
        price: salePrice,
        compareAtPrice: compareAtPrice,
        timestamp: new Date(currentDate),
        isReference: false
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Create previous sale history records
    if (prevSaleHistoryEntries.length > 0) {
      await prisma.priceHistory.createMany({
        data: prevSaleHistoryEntries
      });
    }
  }
  
  return true;
}

export default function PopulateAllTestData() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";
  
  // State for scenario selection
  const [scenarioType, setScenarioType] = useState("mixed");
  
  return (
    <Page>
      <TitleBar title="Create Demo Data for All Products" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Generate Test Compliance Data</Text>
              
              <Text as="p" variant="bodyMd">
                This will create sample compliance records and price history for <strong>all products</strong> in your store.
                Use this to test the compliance widget on your product pages and dashboard features.
              </Text>
              
              <Banner tone="warning">
                <Text as="p" fontWeight="bold">Note:</Text> This will replace any existing compliance data for your products.
              </Banner>

              
              <Select
                label="Choose a compliance scenario"
                options={[
                  {label: "Mixed (variety of compliance states)", value: "mixed"},
                  {label: "All Compliant (all regulations met)", value: "compliant"},
                  {label: "All Non-compliant Reference Price", value: "non_compliant_reference"},
                  {label: "All Non-compliant Sale Duration", value: "non_compliant_duration"},
                  {label: "All Non-compliant Sale Frequency", value: "non_compliant_frequency"}
                ]}
                value={scenarioType}
                onChange={setScenarioType}
                helpText="This determines the type of compliance data that will be generated."
              />
              
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Data to be generated:</Text>
                
                <Text as="p" variant="bodyMd">
                  Products found: {loaderData.products?.length || 0} with multiple variants
                </Text>
                
                {scenarioType === "mixed" && (
                  <Banner tone="info">
                    <Text as="p" fontWeight="medium">Mixed scenario will create:</Text>
                    <ul>
                      <li>Some products with proper reference prices (compliant)</li>
                      <li>Some products with reference price issues (førpris violations)</li>
                      <li>Some products with sale duration issues (over 110 days)</li>
                      <li>Some products with sale frequency issues (sales too close together)</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "compliant" && (
                  <Banner tone="success">
                    <Text as="p" fontWeight="medium">All products will be marked as compliant with Norwegian regulations:</Text>
                    <ul>
                      <li>Proper reference prices (førpris)</li>
                      <li>Appropriate sale duration (15 days)</li>
                      <li>No frequency issues</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "non_compliant_reference" && (
                  <Banner tone="warning">
                    <Text as="p" fontWeight="medium">All products will have <strong>reference price issues</strong>:</Text>
                    <ul>
                      <li>Reference price higher than prices from the 30 days before sale</li>
                      <li>This violates the Norwegian førpris regulation</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "non_compliant_duration" && (
                  <Banner tone="warning">
                    <Text as="p" fontWeight="medium">All products will have <strong>sale duration issues</strong>:</Text>
                    <ul>
                      <li>Sales running for 120 days (exceeds the 110 day guideline)</li>
                      <li>This violates the Norwegian duration guidelines</li>
                    </ul>
                  </Banner>
                )}
                
                {scenarioType === "non_compliant_frequency" && (
                  <Banner tone="warning">
                    <Text as="p" fontWeight="medium">All products will have <strong>sale frequency issues</strong>:</Text>
                    <ul>
                      <li>Multiple sale periods within a short timeframe</li>
                      <li>Only 15 days between sales (should be at least 30)</li>
                    </ul>
                  </Banner>
                )}
              </BlockStack>
              
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
              
              {isLoading && (
                <BlockStack gap="400">
                  <Text as="p" variant="bodyMd">Generating test data... This may take a minute.</Text>
                  <ProgressBar progress={75} size="small" />
                </BlockStack>
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
                    {isLoading ? "Creating test data..." : "Generate Test Data for All Products"}
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