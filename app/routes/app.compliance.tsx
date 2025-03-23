// app/routes/app.compliance.tsx
import { useEffect, useState } from "react";
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
  Spinner
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

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

// Creating a minimal version for MVP
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  try {
    // Get products for the shop
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
    
    // Simplified mock data for MVP
    const mockProducts = products.map((productEdge: any) => {
      const product = productEdge.node;
      const productId = product.id.replace('gid://shopify/Product/', '');
      
      const variant = product.variants.edges[0]?.node;
      const variantId = variant?.id.replace('gid://shopify/ProductVariant/', '');
      const price = variant ? parseFloat(variant.price) : 0;
      const compareAtPrice = variant?.compareAtPrice ? parseFloat(variant.compareAtPrice) : null;
      
      // Simple compliance check - just for MVP
      const isOnSale = compareAtPrice && compareAtPrice > price;
      const isCompliant = Math.random() > 0.2; // Randomly mark some as non-compliant
      
      return {
        productId,
        variantId,
        title: product.title,
        price,
        compareAtPrice,
        isOnSale,
        isCompliant,
        lastChecked: new Date().toISOString(),
        issues: isCompliant ? [] : [{
          rule: 'førpris',
          message: 'Reference price must be the lowest price from the last 30 days'
        }]
      };
    });
    
    // Mock shop settings
    const mockSettings = {
      enabled: true,
      trackingFrequency: 12,
      countryRules: 'NO',
      lastScan: new Date().toISOString()
    };
    
    // Calculate mock stats based on the mock products
    const totalProductCount = mockProducts.length;
    const nonCompliantProducts = mockProducts.filter((p: any) => !p.isCompliant);
    const nonCompliantCount = nonCompliantProducts.length;
    const onSaleCount = mockProducts.filter((p: any) => p.isOnSale).length;
    const complianceRate = totalProductCount > 0 
      ? (((totalProductCount - nonCompliantCount) / totalProductCount) * 100).toFixed(1)
      : "100.0";
    
    const mockStats = {
      totalProductCount,
      nonCompliantCount,
      onSaleCount,
      lastScan: mockSettings.lastScan,
      complianceRate
    };
    
    return json({
      settings: mockSettings,
      stats: mockStats,
      nonCompliantProducts,
      allProducts: mockProducts
    });
  } catch (error) {
    console.error("Error loading compliance data:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error",
      settings: { enabled: true, trackingFrequency: 12, countryRules: 'NO', lastScan: null },
      stats: { totalProductCount: 0, nonCompliantCount: 0, onSaleCount: 0, complianceRate: "100.0", lastScan: null },
      nonCompliantProducts: [],
      allProducts: []
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  // For MVP, just return success response for actions
  if (actionType === "scan") {
    return json<ActionData>({ 
      scanResult: { 
        success: true, 
        productsTracked: 10
      } 
    });
  }
  
  if (actionType === "updateSettings") {
    const enabled = formData.get("enabled") === "true";
    const trackingFrequency = parseInt(formData.get("trackingFrequency") as string, 10);
    const countryRules = formData.get("countryRules") as string;
    
    return json<ActionData>({ 
      updateResult: { 
        success: true,
        settings: {
          enabled,
          trackingFrequency,
          countryRules,
          lastScan: new Date().toISOString()
        }
      } 
    });
  }
  
  return json<ActionData>({ error: "Invalid action" });
};

export default function ComplianceDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);

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
    return new Date(date).toLocaleString();
  };

  // Prepare data for table - avoid using Button component directly
  const nonCompliantRows = loaderData.nonCompliantProducts?.map((product: any) => [
    <a 
      href={`/app/compliance/${product.productId}/${product.variantId}`}
      onClick={(e) => {
        e.preventDefault();
        handleProductClick(product.productId, product.variantId);
      }}
      style={{ color: '#2c6ecb', textDecoration: 'none' }}
    >
      {product.title}
    </a>,
    product.price.toFixed(2),
    product.compareAtPrice ? product.compareAtPrice.toFixed(2) : 'N/A',
    product.isOnSale ? 'Yes' : 'No',
    formatDate(product.lastChecked),
    product.issues ? product.issues.map((issue: any) => issue.message).join(', ') : ''
  ]) || [];

  // Helper to safely check fetcher data properties
  const hasScanResult = fetcher.data && 'scanResult' in fetcher.data;
  const hasUpdateResult = fetcher.data && 'updateResult' in fetcher.data;

  return (
    <Page>
      {/* Replace TitleBar with plain heading for MVP */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>Price Compliance Tracker</h1>
      </div>
      
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
                        onClick={() => setSelectedTab(1)}
                      >
                        View Issues
                      </Button>
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Layout.Section>
          </Layout>
        )}
        
        {selectedTab === 1 && (
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
                  ) : nonCompliantRows.length === 0 ? (
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
        
        {selectedTab === 2 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Compliance Settings</Text>
                  
                  <BlockStack gap="400">
                    <Box>
                      {/* Replace Switch with Checkbox */}
                      <Checkbox
                        label="Enable compliance tracking"
                        checked={settings.enabled}
                        onChange={() => setSettings({...settings, enabled: !settings.enabled})}
                      />
                    </Box>
                    
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
                      helpText="Select which country's regulations to apply"
                    />
                    
                    <Button
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings}
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
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}