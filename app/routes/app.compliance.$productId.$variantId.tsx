// app/routes/app.compliance.$productId.$variantId.tsx
import { useLoaderData, useNavigate } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Banner,
  DataTable,
  EmptyState
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const { productId, variantId } = params;
  
  if (!productId || !variantId) {
    return json({ error: "Product ID and Variant ID are required" });
  }
  
  try {
    // Get product details from Shopify
    const response = await admin.graphql(`
      {
        product(id: "gid://shopify/Product/${productId}") {
          title
          handle
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
      return json({ error: "Product or variant not found" });
    }
    
    // Mock price history for MVP - in reality we would get this from the database
    const mockPriceHistory = [
      {
        timestamp: new Date().toISOString(),
        price: parseFloat(product.variant.price),
        compareAtPrice: product.variant.compareAtPrice ? parseFloat(product.variant.compareAtPrice) : null
      }
    ];
    
    return json({
      shop: session.shop,
      product: {
        id: productId,
        title: product.title,
        handle: product.handle,
        variant: {
          id: variantId,
          title: product.variant.title,
          price: parseFloat(product.variant.price),
          compareAtPrice: product.variant.compareAtPrice ? parseFloat(product.variant.compareAtPrice) : null
        }
      },
      priceHistory: mockPriceHistory,
      isCompliant: true // Simplified for MVP
    });
  } catch (error) {
    console.error("Error loading product details:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
};

export default function ProductComplianceDetails() {
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  
  if ('error' in loaderData) {
    return (
      <Page>
        <TitleBar title="Product Compliance Details" />
        <Banner tone="critical">{loaderData.error}</Banner>
        <Button onClick={() => navigate("/app/compliance")}>
          Back to Compliance
        </Button>
      </Page>
    );
  }
  
  const { product, priceHistory } = loaderData;
  const isOnSale = product.variant.compareAtPrice && product.variant.compareAtPrice > product.variant.price;
  
  // Format dates for display
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  };
  
  // Prepare price history for table
  const priceHistoryRows = priceHistory.map((entry: any) => [
    formatDate(entry.timestamp),
    `${entry.price.toFixed(2)}`,
    entry.compareAtPrice ? `${entry.compareAtPrice.toFixed(2)}` : "None",
    entry.compareAtPrice && entry.price < entry.compareAtPrice ? "Yes" : "No"
  ]);
  
  return (
    <Page>
      <TitleBar title="Product Compliance Details" />
      
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">{product.title}</Text>
                <Text as="p" variant="bodyMd">Variant: {product.variant.title}</Text>
                
                <InlineStack gap="500">
                  <BlockStack gap="200">
                    <Text as="span" variant="bodyMd" fontWeight="bold">Current Price</Text>
                    <Text as="p" variant="headingMd">{product.variant.price.toFixed(2)}</Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text as="span" variant="bodyMd" fontWeight="bold">Compare at Price</Text>
                    <Text as="p" variant="headingMd">
                      {product.variant.compareAtPrice ? product.variant.compareAtPrice.toFixed(2) : "None"}
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text as="span" variant="bodyMd" fontWeight="bold">On Sale</Text>
                    <Badge tone={isOnSale ? "attention" : "info"}>
                      {isOnSale ? "Yes" : "No"}
                    </Badge>
                  </BlockStack>
                </InlineStack>
                
                <Button onClick={() => navigate("/app/compliance")}>
                  Back to Compliance
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Price History</Text>
                
                {priceHistoryRows.length === 0 ? (
                  <EmptyState
                    heading="No price history"
                    image=""
                  >
                    <p>No price history has been recorded for this product yet.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'text']}
                    headings={['Date', 'Price', 'Compare at Price', 'On Sale']}
                    rows={priceHistoryRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}