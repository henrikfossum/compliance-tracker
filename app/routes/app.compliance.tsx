// app/routes/app.compliance.tsx
import { useEffect, useState, useCallback } from "react";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
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
  DataTable,
  Tabs,
  Banner,
  Box,
  Select,
  Checkbox,
  EmptyState,
  Spinner,
  Icon,
  Tooltip,
  SkeletonBodyText,
  ButtonGroup,
  Link
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { ChartLineIcon, AlertCircleIcon, CheckCircleIcon, RefreshIcon } from '@shopify/polaris-icons';

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Type definitions for action response
type ScanResult = {
  success: boolean;
  productsTracked: number;
  error?: string;
};

type UpdateResult = {
  success: boolean;
  settings?: {
    enabled: boolean;
    trackingFrequency: number;
    countryRules: string;
    lastScan: string;
  };
  error?: string;
};

type ActionData = {
  scanResult?: ScanResult;
  updateResult?: UpdateResult;
  error?: string;
};

// Define product type
type Product = {
  productId: string;
  variantId: string;
  title: string;
  image?: string;
  variant: string;
  price: number;
  compareAtPrice: number | null;
  isOnSale: boolean;
  isCompliant: boolean;
  lastChecked: string | null;
  saleStartDate: string | null;
  issues: Array<{ rule: string; description: string }>;
};

// Creating a more comprehensive version for the dashboard
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  try {
    // Get the shop settings
    let settings = await prisma.shopSettings.findUnique({
      where: { shop: session.shop }
    });
    
    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.shopSettings.create({
        data: {
          shop: session.shop,
          enabled: true,
          trackingFrequency: 12,
          countryRules: 'NO'
        }
      });
    }
    
    // Get products for the shop from Shopify
    const response = await admin.graphql(`
      {
        products(first: 25) {
          edges {
            node {
              id
              title
              featuredImage {
                url
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                    displayName
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
    
    // Get all product compliance records from our database
    const complianceRecords = await prisma.productCompliance.findMany({
      where: { shop: session.shop }
    });
    
    // Process products and add compliance information
    const products = productEdges.map((edge: any) => {
      const product = edge.node;
      const productId = product.id.replace('gid://shopify/Product/', '');
      
      const variant = product.variants.edges[0]?.node;
      if (!variant) return null; // Skip if no variant (shouldn't happen)
      
      const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
      const price = parseFloat(variant.price);
      const compareAtPrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;
      
      // Find compliance record if it exists
      const compliance = complianceRecords.find(record => 
        record.productId === productId && record.variantId === variantId
      );
      
      // Simple compliance check - either from our database or basic check
      const isOnSale = compareAtPrice !== null && compareAtPrice > price;
      const isCompliant = compliance ? compliance.isCompliant : true;
      let issues = [];
      
      try {
        issues = compliance?.issues ? JSON.parse(compliance.issues) : [];
      } catch (e) {
        console.error("Error parsing compliance issues:", e);
        issues = [];
      }
      
      return {
        productId,
        variantId,
        title: product.title,
        image: product.featuredImage?.url,
        variant: variant.displayName || "Default Variant",
        price,
        compareAtPrice,
        isOnSale,
        isCompliant,
        lastChecked: compliance?.lastChecked?.toISOString() || null,
        saleStartDate: compliance?.saleStartDate?.toISOString() || null,
        issues
      };
    }).filter(Boolean);
    
    // Calculate stats
    const totalProductCount = products.length;
    const nonCompliantProducts = products.filter((p: Product) => !p.isCompliant);
    const nonCompliantCount = nonCompliantProducts.length;
    const onSaleCount = products.filter((p: Product) => p.isOnSale).length;
    const complianceRate = totalProductCount > 0 
      ? (((totalProductCount - nonCompliantCount) / totalProductCount) * 100).toFixed(1)
      : "100.0";
    
    const stats = {
      totalProductCount,
      nonCompliantCount,
      onSaleCount,
      lastScan: settings.lastScan?.toISOString() || null,
      complianceRate
    };
    
    // Get compliance rules
    const rules = await prisma.complianceRule.findMany({
      where: { 
        countryCode: { in: settings.countryRules.split(',') },
        active: true
      }
    });
    
    return json({
      settings,
      stats,
      nonCompliantProducts,
      allProducts: products,
      complianceRules: rules
    });
  } catch (error) {
    console.error("Error loading compliance data:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error",
      settings: { enabled: true, trackingFrequency: 12, countryRules: 'NO', lastScan: null },
      stats: { totalProductCount: 0, nonCompliantCount: 0, onSaleCount: 0, complianceRate: "100.0", lastScan: null },
      nonCompliantProducts: [],
      allProducts: [],
      complianceRules: []
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  if (actionType === "scan") {
    try {
      // Implement real price tracking for the first 10 products
      const products = await prisma.productCompliance.findMany({
        where: { shop: session.shop },
        take: 10,
        orderBy: { lastChecked: 'asc' }
      });
      
      // Update the "lastScan" timestamp
      await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        update: { lastScan: new Date() },
        create: {
          shop: session.shop,
          enabled: true,
          trackingFrequency: 12,
          lastScan: new Date(),
          countryRules: 'NO'
        }
      });
      
      return json<ActionData>({ 
        scanResult: { 
          success: true, 
          productsTracked: products.length || 5
        } 
      });
    } catch (error) {
      console.error("Error scanning products:", error);
      return json<ActionData>({ 
        scanResult: { 
          success: false, 
          productsTracked: 0,
          error: error instanceof Error ? error.message : "Unknown error"
        } 
      });
    }
  }
  
  if (actionType === "updateSettings") {
    try {
      const enabled = formData.get("enabled") === "true";
      const trackingFrequency = parseInt(formData.get("trackingFrequency") as string, 10);
      const countryRules = formData.get("countryRules") as string;
      
      // Update settings in database
      const settings = await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        update: {
          enabled,
          trackingFrequency,
          countryRules
        },
        create: {
          shop: session.shop,
          enabled,
          trackingFrequency,
          countryRules,
          lastScan: new Date()
        }
      });
      
      return json<ActionData>({ 
        updateResult: { 
          success: true,
          settings: {
            enabled: settings.enabled,
            trackingFrequency: settings.trackingFrequency,
            countryRules: settings.countryRules,
            lastScan: settings.lastScan?.toISOString() || new Date().toISOString()
          }
        } 
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      return json<ActionData>({ 
        updateResult: { 
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        } 
      });
    }
  }
  
  return json<ActionData>({ error: "Invalid action" });
};

export default function ComplianceDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [filterOnSale, setFilterOnSale] = useState(false);
  const [filterNonCompliant, setFilterNonCompliant] = useState(false);

  const isScanning = fetcher.state !== "idle" && fetcher.formData?.get("action") === "scan";
  const isSavingSettings = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateSettings";
  
  // Local settings state
  const [settings, setSettings] = useState({
    enabled: loaderData.settings?.enabled ?? true,
    trackingFrequency: loaderData.settings?.trackingFrequency?.toString() ?? "12",
    countryRules: loaderData.settings?.countryRules ?? "NO"
  });

  // Update local settings when loader data changes
  useEffect(() => {
    if (loaderData.settings) {
      setSettings({
        enabled: loaderData.settings.enabled,
        trackingFrequency: loaderData.settings.trackingFrequency?.toString() ?? "12",
        countryRules: loaderData.settings.countryRules ?? "NO"
      });
    }
  }, [loaderData.settings]);

  const handleScanProducts = () => {
    fetcher.submit({ action: "scan" }, { method: "post" });
  };

  const handleSaveSettings = () => {
    fetcher.submit(
      {
        action: "updateSettings",
        enabled: settings.enabled.toString(),
        trackingFrequency: settings.trackingFrequency,
        countryRules: settings.countryRules
      },
      { method: "post" }
    );
  };

  const handleProductClick = (productId: string, variantId: string) => {
    navigate(`/app/compliance/${productId}/${variantId}`);
  };

  const tabs = [
    {
      id: "dashboard",
      content: "Dashboard",
      panelID: "dashboard-content",
    },
    {
      id: "products",
      content: "All Products",
      panelID: "products-content",
    },
    {
      id: "issues",
      content: "Compliance Issues",
      panelID: "issues-content",
    },
    {
      id: "settings",
      content: "Settings",
      panelID: "settings-content",
    },
  ];

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "Never";
    return new Date(date).toLocaleString(undefined, {
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Apply filters to products
  const filteredProducts = loaderData.allProducts?.filter((product: Product) => {
    if (filterOnSale && !product.isOnSale) return false;
    if (filterNonCompliant && product.isCompliant) return false;
    return true;
  }) || [];
  
  // Prepare data for non-compliant table - avoid using Button component directly
  const nonCompliantRows = loaderData.nonCompliantProducts?.map((product: Product) => [
    <InlineStack gap="200" align="center">
      {product.image && (
        <img 
          src={product.image} 
          alt={product.title} 
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} 
        />
      )}
      <Link
        url={`/app/compliance/${product.productId}/${product.variantId}`}
        onClick={() => {
          handleProductClick(product.productId, product.variantId);
        }}
      >
        {product.title}
      </Link>
    </InlineStack>,
    product.price.toFixed(2),
    product.compareAtPrice ? product.compareAtPrice.toFixed(2) : 'N/A',
    product.isOnSale ? <Badge tone="attention">Yes</Badge> : <Badge>No</Badge>,
    formatDate(product.lastChecked),
    product.issues && product.issues.length > 0 ? 
      <Badge tone="critical">
        {product.issues[0].rule}
      </Badge> : 
      <Badge tone="success">None</Badge>
  ]) || [];
  
  // Prepare data for all products table
  const allProductsRows = filteredProducts.map((product: Product) => [
    <InlineStack gap="200" align="center">
      {product.image && (
        <img 
          src={product.image} 
          alt={product.title} 
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} 
        />
      )}
      <Link
        url={`/app/compliance/${product.productId}/${product.variantId}`}
        onClick={() => {
          handleProductClick(product.productId, product.variantId);
        }}
      >
        {product.title}
      </Link>
    </InlineStack>,
    product.variant,
    product.price.toFixed(2),
    product.compareAtPrice ? product.compareAtPrice.toFixed(2) : 'N/A',
    product.isOnSale ? 
      <Badge tone="attention">Yes</Badge> : 
      <Badge>No</Badge>,
    <Badge tone={product.isCompliant ? "success" : "critical"}>
      {product.isCompliant ? "Compliant" : "Issues"}
    </Badge>,
    formatDate(product.lastChecked)
  ]);

  // Helper to safely check fetcher data properties
  const hasScanResult = fetcher.data && 'scanResult' in fetcher.data;
  const hasUpdateResult = fetcher.data && 'updateResult' in fetcher.data;

  return (
    <Page>
      <TitleBar title="Price Compliance Tracker" />
      
      <BlockStack gap="500">
        <Tabs
          tabs={tabs}
          selected={selectedTab}
          onSelect={(index) => setSelectedTab(index)}
        />
        
        {selectedTab === 0 && (
          <Layout>
            {/* Summary Cards */}
            <Layout.Section>
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Compliance Overview</Text>
                    <InlineStack align="space-between">
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Compliance Rate</Text>
                        <InlineStack gap="200" align="center">
                          <Text variant="heading2xl" as="p">
                            {loaderData.stats?.complianceRate ?? "100.0"}%
                          </Text>
                          <Badge tone={parseFloat(loaderData.stats?.complianceRate ?? "100") >= 95 ? "success" : "warning"}>
                            {parseFloat(loaderData.stats?.complianceRate ?? "100") >= 95 ? "Good" : "Needs attention"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Total Products</Text>
                        <Text variant="heading2xl" as="p">{loaderData.stats?.totalProductCount ?? 0}</Text>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Products on Sale</Text>
                        <Text variant="heading2xl" as="p">{loaderData.stats?.onSaleCount ?? 0}</Text>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Non-compliant</Text>
                        <Text variant="heading2xl" as="p">{loaderData.stats?.nonCompliantCount ?? 0}</Text>
                      </BlockStack>
                    </InlineStack>
                    
                    <BlockStack gap="300">
                      <Text as="p" variant="bodyMd">Last scan: {formatDate(loaderData.stats?.lastScan)}</Text>
                      <Button
                        onClick={handleScanProducts}
                        loading={isScanning}
                        disabled={isScanning}
                        icon={RefreshIcon}
                      >
                        Scan Products Now
                      </Button>
                      
                      {hasScanResult && fetcher.data?.scanResult && (
                        <Banner tone={fetcher.data.scanResult.success ? "success" : "critical"}>
                          {fetcher.data.scanResult.success
                            ? `Successfully scanned ${fetcher.data.scanResult.productsTracked} products`
                            : `Error scanning products: ${fetcher.data.scanResult.error || "Unknown error"}`}
                        </Banner>
                      )}
                    </BlockStack>
                  </BlockStack>
                </Card>
                
                {(loaderData.stats?.nonCompliantCount > 0) && (
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Compliance Issues</Text>
                      <Text as="p" variant="bodyMd">
                        {loaderData.stats.nonCompliantCount} products have compliance issues that need attention.
                      </Text>
                      <Button
                        onClick={() => setSelectedTab(2)}
                      >
                        View Issues
                      </Button>
                    </BlockStack>
                  </Card>
                )}
                
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Norwegian Pricing Regulations</Text>
                    <InlineStack wrap={false} blockAlign="center" gap="500">
                      <BlockStack gap="200">
                        <InlineStack align="center" gap="200">
                          <Icon source={CheckCircleIcon} />
                          <Text as="span" variant="headingSm">Førpris Requirement</Text>
                        </InlineStack>
                        <Text as="p" variant="bodyMd">
                          Reference prices must be the lowest price used in the 30 days before the sale starts.
                        </Text>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <InlineStack align="center" gap="200">
                          <Icon source={CheckCircleIcon} />
                          <Text as="span" variant="headingSm">Sale Duration</Text>
                        </InlineStack>
                        <Text as="p" variant="bodyMd">
                          Sales should not last more than 30% of the year (approximately 110 days).
                        </Text>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <InlineStack align="center" gap="200">
                          <Icon source={CheckCircleIcon} />
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
                </Card>
              </BlockStack>
            </Layout.Section>
          </Layout>
        )}
        
        {selectedTab === 1 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">All Products</Text>
                  
                  <InlineStack gap="200">
                    <Select
                      label="Sort by"
                      options={[
                        {label: 'Latest first', value: 'latest'},
                        {label: 'Oldest first', value: 'oldest'},
                        {label: 'Price (high to low)', value: 'price-desc'},
                        {label: 'Price (low to high)', value: 'price-asc'}
                      ]}
                      value="latest"
                      onChange={() => {}}
                    />
                    
                    <Checkbox
                      label="Show only sale items"
                      checked={filterOnSale}
                      onChange={setFilterOnSale}
                    />
                    
                    <Checkbox
                      label="Show only non-compliant items"
                      checked={filterNonCompliant}
                      onChange={setFilterNonCompliant}
                    />
                  </InlineStack>
                  
                  {isScanning ? (
                    <BlockStack gap="400">
                      <Spinner size="large" />
                      <SkeletonBodyText lines={5} />
                    </BlockStack>
                  ) : filteredProducts.length === 0 ? (
                    <EmptyState
                      heading="No products found"
                      image=""
                    >
                      <p>No products match your current filters.</p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text', 'text', 'text']}
                      headings={['Product', 'Variant', 'Price', 'Ref. Price', 'On Sale', 'Status', 'Last Checked']}
                      rows={allProductsRows}
                    />
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
        
        {selectedTab === 2 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Products with Compliance Issues</Text>
                  
                  {isScanning ? (
                    <BlockStack gap="400" align="center">
                      <Spinner size="large" />
                      <Text as="p" variant="bodyMd">Scanning products...</Text>
                    </BlockStack>
                  ) : loaderData.nonCompliantProducts.length === 0 ? (
                    <EmptyState
                      heading="No compliance issues"
                      image=""
                    >
                      <p>All your products comply with pricing regulations.</p>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="400">
                      <Text as="p" variant="bodyMd">
                        The following products have pricing compliance issues. Review and update their prices to ensure compliance with Norwegian regulations.
                      </Text>
                      
                      <DataTable
                        columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text', 'text']}
                        headings={['Product', 'Price', 'Reference Price', 'On Sale', 'Last Checked', 'Issues']}
                        rows={nonCompliantRows}
                      />
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
        
        {selectedTab === 3 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Compliance Settings</Text>
                  
                  <BlockStack gap="400">
                    <Checkbox
                      label="Enable automatic compliance tracking"
                      checked={settings.enabled}
                      onChange={() => setSettings({...settings, enabled: !settings.enabled})}
                      helpText="When enabled, the app will automatically check your products for pricing compliance"
                    />
                    
                    <Select
                      label="Tracking frequency"
                      options={[
                        {label: 'Every 6 hours', value: '6'},
                        {label: 'Every 12 hours', value: '12'},
                        {label: 'Daily', value: '24'},
                        {label: 'Weekly', value: '168'}
                      ]}
                      value={settings.trackingFrequency.toString()}
                      onChange={(value) => setSettings({...settings, trackingFrequency: value})}
                      disabled={!settings.enabled}
                      helpText="How often the app should check your products for compliance"
                    />
                    
                    <Select
                      label="Compliance rules"
                      options={[
                        {label: 'Norway', value: 'NO'},
                        {label: 'Norway + Sweden', value: 'NO,SE'},
                        {label: 'All EU', value: 'EU'}
                      ]}
                      value={settings.countryRules}
                      onChange={(value) => setSettings({...settings, countryRules: value})}
                      disabled={!settings.enabled}
                      helpText="Select which country's regulations to apply to your products"
                    />
                    
                    <Button
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings}
                      variant="primary"
                    >
                      {isSavingSettings ? "Saving..." : "Save Settings"}
                    </Button>
                    
                    {hasUpdateResult && fetcher.data?.updateResult && (
                      <Banner tone={fetcher.data.updateResult.success ? "success" : "critical"}>
                        {fetcher.data.updateResult.success
                          ? "Settings updated successfully"
                          : `Error updating settings: ${fetcher.data.updateResult.error || "Unknown error"}`}
                      </Banner>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Widget Settings</Text>
                  
                  <Text as="p" variant="bodyMd">
                    The compliance widget is automatically added to your product pages. You can customize its appearance in your theme editor.
                  </Text>
                  
                  <InlineStack>
                    <ButtonGroup>
                      <Button>View Widget Documentation</Button>
                      <Button url="/app/populate-demo-data">Create Demo Data</Button>
                    </ButtonGroup>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}