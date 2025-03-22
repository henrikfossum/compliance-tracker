// app/routes/app.compliance.tsx
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
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
  Spinner,
  SkeletonBodyText,
  Select,
  TextField,
  Box,
  ToggleButton,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { getShopSettings, updateShopSettings } from "../services/complianceSettings.server";
import { trackPricesForShop } from "../services/priceTracker.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Get shop settings
  const { settings } = await getShopSettings(session.shop);
  
  // Get compliance statistics
  const stats = await getComplianceStats(session.shop);
  
  // Get non-compliant products
  const nonCompliantProducts = await prisma.productCompliance.findMany({
    where: {
      shop: session.shop,
      isCompliant: false
    },
    orderBy: {
      lastChecked: 'desc'
    },
    take: 10
  });
  
  return json({
    settings,
    stats,
    nonCompliantProducts
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "scan") {
    // Trigger a price scan
    const result = await trackPricesForShop(session);
    return json({ scanResult: result });
  }
  
  if (action === "updateSettings") {
    // Update shop settings
    const enabled = formData.get("enabled") === "true";
    const trackingFrequency = parseInt(formData.get("trackingFrequency") as string, 10);
    const countryRules = formData.get("countryRules") as string;
    
    const result = await updateShopSettings(session.shop, {
      enabled,
      trackingFrequency,
      countryRules
    });
    
    return json({ updateResult: result });
  }
  
  return json({ error: "Invalid action" });
};

async function getComplianceStats(shop: string) {
  // Get total products
  const totalProductCount = await prisma.productCompliance.count({
    where: { shop }
  });
  
  // Get compliance counts
  const nonCompliantCount = await prisma.productCompliance.count({
    where: {
      shop,
      isCompliant: false
    }
  });
  
  // Get products on sale
  const onSaleCount = await prisma.productCompliance.count({
    where: {
      shop,
      isOnSale: true
    }
  });
  
  // Get last scan time
  const shopSettings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { lastScan: true }
  });
  
  return {
    totalProductCount,
    nonCompliantCount,
    onSaleCount,
    lastScan: shopSettings?.lastScan,
    complianceRate: totalProductCount > 0 
      ? (((totalProductCount - nonCompliantCount) / totalProductCount) * 100).toFixed(1)
      : "100.0"
  };
}

export default function ComplianceDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [selectedTab, setSelectedTab] = useState(0);

  const isScanning = fetcher.state !== "idle" && fetcher.formData?.get("action") === "scan";
  const isSavingSettings = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateSettings";
  
  // Local settings state
  const [settings, setSettings] = useState({
    enabled: loaderData.settings?.enabled ?? true,
    trackingFrequency: loaderData.settings?.trackingFrequency?.toString() ?? "12",
    countryRules: loaderData.settings?.countryRules ?? "NO"
  });

 // app/routes/app.compliance.tsx (continued)
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

  const nonCompliantRows = loaderData.nonCompliantProducts.map(product => [
    product.productId,
    product.variantId,
    product.referencePrice?.toString() ?? 'N/A',
    product.isOnSale ? 'Yes' : 'No',
    formatDate(product.lastChecked),
    JSON.parse(product.issues || '[]').map((issue: any) => issue.message).join(', ')
  ]);

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
                            {loaderData.stats.complianceRate}%
                          </Text>
                          <Badge tone={parseFloat(loaderData.stats.complianceRate) >= 95 ? "success" : "warning"}>
                            {parseFloat(loaderData.stats.complianceRate) >= 95 ? "Good" : "Needs attention"}
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Total Products</Text>
                        <Text variant="heading2xl" as="p">{loaderData.stats.totalProductCount}</Text>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Products on Sale</Text>
                        <Text variant="heading2xl" as="p">{loaderData.stats.onSaleCount}</Text>
                      </BlockStack>
                      
                      <BlockStack gap="200">
                        <Text as="span" variant="bodyLg" fontWeight="bold">Non-compliant</Text>
                        <Text variant="heading2xl" as="p">{loaderData.stats.nonCompliantCount}</Text>
                      </BlockStack>
                    </InlineStack>
                    
                    <BlockStack gap="300">
                      <Text as="span" variant="bodyMd">Last scan: {formatDate(loaderData.stats.lastScan)}</Text>
                      <Button
                        onClick={handleScanProducts}
                        loading={isScanning}
                        disabled={isScanning}
                      >
                        Scan Products Now
                      </Button>
                      
                      {fetcher.data?.scanResult && (
                        <Banner tone={fetcher.data.scanResult.success ? "success" : "critical"}>
                          {fetcher.data.scanResult.success
                            ? `Successfully scanned ${fetcher.data.scanResult.productsTracked} products`
                            : `Error scanning products: ${fetcher.data.scanResult.error}`}
                        </Banner>
                      )}
                    </BlockStack>
                  </BlockStack>
                </Card>
                
                {loaderData.stats.nonCompliantCount > 0 && (
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Compliance Issues</Text>
                      <Text as="p" variant="bodyMd">
                        {loaderData.stats.nonCompliantCount} products have compliance issues that need attention.
                      </Text>
                      <Button
                        onClick={() => setSelectedTab(1)}
                        variant="primary"
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
                  
                  {loaderData.nonCompliantProducts.length === 0 ? (
                    <Banner tone="success">
                      Great job! All your products comply with pricing regulations.
                    </Banner>
                  ) : (
                    <BlockStack gap="400">
                      <Text as="p" variant="bodyMd">
                        The following products have pricing compliance issues. Review and update their prices to ensure compliance with Norwegian regulations.
                      </Text>
                      
                      <DataTable
                        columnContentTypes={['text', 'text', 'numeric', 'text', 'text', 'text']}
                        headings={['Product ID', 'Variant ID', 'Reference Price', 'On Sale', 'Last Checked', 'Issues']}
                        rows={nonCompliantRows}
                      />
                      
                      {loaderData.nonCompliantProducts.length === 10 && (
                        <Text as="p" variant="bodyMd">
                          Showing the 10 most recently checked non-compliant products. There may be more issues to address.
                        </Text>
                      )}
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
                      <ToggleButton
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
                      value={settings.trackingFrequency}
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
                      primary
                      loading={isSavingSettings}
                      disabled={isSavingSettings}
                    >
                      Save Settings
                    </Button>
                    
                    {fetcher.data?.updateResult && (
                      <Banner tone={fetcher.data.updateResult.success ? "success" : "critical"}>
                        {fetcher.data.updateResult.success
                          ? "Settings updated successfully"
                          : `Error updating settings: ${fetcher.data.updateResult.error}`}
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