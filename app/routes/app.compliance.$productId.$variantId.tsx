// app/routes/app.compliance.$productId.$variantId.tsx
import { useState } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
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
  Box,
  DescriptionList,
  DataTable,
  EmptyState,
  Link,
} from "@shopify/polaris";
import { TitleBar, useNavigate } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { trackProductPrice } from "../services/priceTracker.server";
import { getProductComplianceStatus } from "../services/complianceChecker.server";
import prisma from "../db.server";

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
    
    // Get compliance details
    const compliance = await prisma.productCompliance.findUnique({
      where: {
        shop_productId_variantId: {
          shop: session.shop,
          productId,
          variantId
        }
      }
    });
    
    // Get price history
    const priceHistory = await prisma.priceHistory.findMany({
      where: {
        shop: session.shop,
        productId,
        variantId
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 30
    });
    
    return json({
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
      compliance: compliance ? {
        ...compliance,
        issues: compliance.issues ? JSON.parse(compliance.issues) : []
      } : null,
      priceHistory
    });
  } catch (error) {
    console.error("Error loading product details:", error);
    return json({ error: error.message });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { productId, variantId } = params;
  
  if (!productId || !variantId) {
    return json({ error: "Product ID and Variant ID are required" });
  }
  
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "checkCompliance") {
    // Re-check compliance for this product
    await trackProductPrice(session, productId, variantId);
    const complianceStatus = await getProductComplianceStatus(session.shop, productId, variantId);
    
    return json({ checkResult: complianceStatus });
  }
  
  return json({ error: "Invalid action" });
};

export default function ProductComplianceDetails() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  
  if (loaderData.error) {
    return (
      <Page>
        <TitleBar
          title="Product Compliance Details"
          breadcrumbs={[{ content: "Back to Compliance", onAction: () => navigate("/app/compliance") }]}
        />
        <Banner tone="critical">{loaderData.error}</Banner>
      </Page>
    );
  }
  
  const { product, compliance, priceHistory } = loaderData;
  const isOnSale = product.variant.compareAtPrice && product.variant.compareAtPrice > product.variant.price;
  
  const isChecking = fetcher.state !== "idle" && fetcher.formData?.get("action") === "checkCompliance";
  
  // Format dates for display
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  };
  
  // Prepare price history for table
  const priceHistoryRows = priceHistory.map(entry => [
    formatDate(entry.timestamp),
    `${entry.price.toFixed(2)}`,
    entry.compareAtPrice ? `${entry.compareAtPrice.toFixed(2)}` : "None",
    entry.compareAtPrice && entry.price < entry.compareAtPrice ? "Yes" : "No"
  ]);
  
  return (
    <Page>
      <TitleBar
        title="Product Compliance Details"
        breadcrumbs={[{ content: "Back to Compliance", onAction: () => navigate("/app/compliance") }]}
      />
      
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
                    <Text variant="headingMd">{product.variant.price.toFixed(2)}</Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text as="span" variant="bodyMd" fontWeight="bold">Compare at Price</Text>
                    <Text variant="headingMd">
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
                
                <InlineStack>
                  <Button
                    onClick={() => window.open(`https://${loaderData.shop}/admin/products/${product.id}/variants/${product.variant.id}`, '_blank')}
                  >
                    Edit in Shopify
                  </Button>
                  
                  <Button
                    onClick={() => {
                      fetcher.submit(
                        { action: "checkCompliance" },
                        { method: "post" }
                      );
                    }}
                    loading={isChecking}
                    disabled={isChecking}
                  >
                    Re-check Compliance
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Compliance Status</Text>
                
                {fetcher.data?.checkResult ? (
                  <Banner tone={fetcher.data.checkResult.isCompliant ? "success" : "critical"}>
                    {fetcher.data.checkResult.isCompliant
                      ? "This product complies with all price regulations."
                      : "This product has compliance issues that need to be addressed."}
                  </Banner>
                ) : compliance ? (
                  <Banner tone={compliance.isCompliant ? "success" : "critical"}>
                    {compliance.isCompliant
                      ? "This product complies with all price regulations."
                      : "This product has compliance issues that need to be addressed."}
                  </Banner>
                ) : (
                  <Banner tone="warning">
                    Compliance status not available. Click "Re-check Compliance" to analyze this product.
                  </Banner>
                )}
                
                {(compliance || fetcher.data?.checkResult) && (
                  <DescriptionList
                    items={[
                      {
                        term: "Reference Price",
                        description: compliance?.referencePrice?.toFixed(2) || "Not set"
                      },
                      {
                        term: "On Sale Since",
                        description: formatDate(compliance?.saleStartDate) || "N/A"
                      },
                      {
                        term: "Last Checked",
                        description: formatDate(compliance?.lastChecked)
                      }
                    ]}
                  />
                )}
                
                {(compliance?.issues?.length > 0 || (fetcher.data?.checkResult?.issues?.length > 0)) && (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd">Compliance Issues</Text>
                    <Box padding="400" background="bg-surface-warning" borderRadius="200">
                      <BlockStack gap="200">
                        {(fetcher.data?.checkResult?.issues || compliance?.issues)?.map((issue: any, index: number) => (
                          <Text key={index} variant="bodyMd">
                            • <strong>{issue.rule}:</strong> {issue.message}
                          </Text>
                        ))}
                      </BlockStack>
                    </Box>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Price History (Last 30 Entries)</Text>
                
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