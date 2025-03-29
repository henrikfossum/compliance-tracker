// app/routes/app._index.tsx
import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Icon,
  Badge,
  Link,
  LegacyCard,
  ProgressBar,
  Avatar,
} from "@shopify/polaris";
import { 
  AlertDiamondIcon, 
  CheckIcon, 
  ChartVerticalIcon, 
  ProductIcon
} from '@shopify/polaris-icons';
import { authenticate } from "../shopify.server";
import { Link as RemixLink } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();

  const product = responseJson.data?.productCreate?.product;
  if (!product) {
    throw new Error("Failed to create product");
  }

  const variantId = product.variants.edges[0]?.node?.id;
  if (!variantId) {
    throw new Error("Product variant not found");
  }

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data?.productCreate?.product,
    variant: variantResponseJson.data?.productVariantsBulkUpdate?.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
    
  const productId = fetcher.data?.product?.id?.replace(
    "gid://shopify/Product/",
    "",
  );
  
  const generateProduct = () => fetcher.submit({}, { method: "POST" });
  
  // Stats data (would be replaced with real data in production)
  const complianceStats = {
    complianceRate: "92.5%",
    totalProducts: 48,
    productsOnSale: 16,
    nonCompliantCount: 4,
    lastScanned: "2025-03-26T09:45:00Z"
  };

  // Issues list (would come from real data in production)
  const complianceIssues = [
    {
      product: "Premium Winter Jacket",
      issue: "førpris",
      description: "Reference price issue - sale price is incorrect"
    },
    {
      product: "Outdoor Hiking Boots",
      issue: "saleDuration",
      description: "Sale has been running for too long (over 110 days)"
    }
  ];
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Page>
      <BlockStack gap="500">
        {/* Greeting section */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" align="space-between">
              <BlockStack gap="200">
                <Text as="h1" variant="headingXl">
                  Price Compliance Dashboard
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Ensure your store's pricing meets Norwegian regulations
                </Text>
              </BlockStack>
              <Button
                variant="primary"
                url="/app/compliance"
              >
                Go to Compliance Center
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
        
        {/* Stats cards */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Compliance Status</Text>
                <InlineStack gap="500" wrap={false}>
                  <div style={{ 
                    width: '120px', 
                    height: '120px', 
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
                      <svg viewBox="0 0 36 36" width="100%" height="100%">
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#E4E5E7"
                          strokeWidth="2"
                        />
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#008060"
                          strokeWidth="2"
                          strokeDasharray="92.5, 100"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <Text as="p" variant="heading2xl">
                      {complianceStats.complianceRate}
                    </Text>
                  </div>
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" tone="subdued">Total Products</Text>
                      <Text as="p" variant="headingLg">{complianceStats.totalProducts}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" tone="subdued">Products on Sale</Text>
                      <Text as="p" variant="headingLg">{complianceStats.productsOnSale}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" tone="subdued">Non-compliant</Text>
                      <Text as="p" variant="headingLg">{complianceStats.nonCompliantCount}</Text>
                    </BlockStack>
                  </BlockStack>
                </InlineStack>
                <Box paddingBlockStart="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Last scanned: {formatDate(complianceStats.lastScanned)}
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
          
            <Layout.Section>
              <Layout>
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Compliance Issues</Text>

                      {complianceIssues.length > 0 ? (
                        <BlockStack gap="300">
                          {complianceIssues.map((issue, index) => (
                            <InlineStack key={index} gap="300" align="start" blockAlign="center">
                              <div style={{ paddingTop: '2px' }}>
                                <Icon source={AlertDiamondIcon} tone="critical" />
                              </div>
                              <BlockStack gap="100">
                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                  {issue.product}
                                </Text>
                                <InlineStack gap="200">
                                  <Badge tone="critical">{issue.issue}</Badge>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {issue.description}
                                  </Text>
                                </InlineStack>
                              </BlockStack>
                            </InlineStack>
                          ))}

                          <Box paddingBlockStart="200">
                            <Button 
                              variant="primary" 
                              url="/app/compliance"
                            >
                              Review All Issues
                            </Button>
                          </Box>
                        </BlockStack>
                      ) : (
                        <InlineStack gap="300" align="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="p">No compliance issues detected.</Text>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Card>
                </Layout.Section>

                {/* Optional second half section */}
                <Layout.Section>
                  {/* Add another card here if needed */}
                </Layout.Section>
              </Layout>
            </Layout.Section>
          </Layout>

        
        {/* Regulations card */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Norwegian Pricing Regulations</Text>
            <LegacyCard sectioned>
              <BlockStack gap="400">
                <InlineStack wrap={false} blockAlign="center" gap="500">
                  <BlockStack gap="200">
                    <InlineStack align="center" gap="200">
                      <Badge tone="success">Førpris</Badge>
                      <Text as="span" variant="headingSm">Reference Price Requirement</Text>
                    </InlineStack>
                    <Text as="p" variant="bodyMd">
                      Reference prices must be the lowest price used in the 30 days before the sale starts.
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <InlineStack align="center" gap="200">
                      <Badge tone="success">Duration</Badge>
                      <Text as="span" variant="headingSm">Sale Duration</Text>
                    </InlineStack>
                    <Text as="p" variant="bodyMd">
                      Sales should not last more than 30% of the year (approximately 110 days).
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <InlineStack align="center" gap="200">
                      <Badge tone="success">Frequency</Badge>
                      <Text as="span" variant="headingSm">Sales Frequency</Text>
                    </InlineStack>
                    <Text as="p" variant="bodyMd">
                      Products should not be on sale too frequently. Ensure sufficient time between sales.
                    </Text>
                  </BlockStack>
                </InlineStack>
                
                <Link url="https://forbrukertilsynet.no/veiledning-om-reglene-som-gjelder-ved-markedsforing-av-salg-og-betingede-tilbud" external>
                  View complete regulations (Forbrukertilsynet)
                </Link>
              </BlockStack>
            </LegacyCard>
          </BlockStack>
        </Card>
        
        {/* Demo tools */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Testing & Demo Tools</Text>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Create Test Product</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Generate a sample product to test the compliance functions
                  </Text>
                </BlockStack>
                <Button 
                  loading={isLoading} 
                  onClick={generateProduct}
                  icon={ProductIcon}
                >
                  Generate Product
                </Button>
              </InlineStack>
              
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Create Demo Data</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Generate sample compliance records and price history
                  </Text>
                </BlockStack>
                <Button 
                  url="/app/populate-demo-data"
                  icon={ChartVerticalIcon}
                >
                  Create Demo Data
                </Button>
              </InlineStack>
              
              {fetcher.data?.product && (
                <Box paddingBlockStart="300">
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="p" variant="headingSm">
                          {fetcher.data.product.title}
                        </Text>
                        <Button
                          url={`shopify:admin/products/${productId}`}
                          variant="plain"
                        >
                          View product
                        </Button>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Product created successfully! Use this product to test compliance features.
                      </Text>
                    </BlockStack>
                  </Card>
                </Box>
              )}
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}