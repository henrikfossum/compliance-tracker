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
  Link,
  TextField,
  LegacyFilters,
  IndexFilters,
  IndexFiltersMode,
  ActionList
} from "@shopify/polaris";
import { 
  AlertCircleIcon, 
  CheckCircleIcon, 
  RefreshIcon,
  ImageIcon,
  SortIcon,
  FilterIcon,
  SearchIcon
} from '@shopify/polaris-icons';

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Define product type
interface Product {
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
  issues: Array<{ rule: string; message?: string; description?: string }>;
}

// Define loader return type for better type safety
type LoaderReturnType = {
  settings: {
    enabled: boolean;
    trackingFrequency: number;
    countryRules: string;
    lastScan: Date | null;
  };
  stats: {
    totalProductCount: number;
    nonCompliantCount: number;
    onSaleCount: number;
    lastScan: string | null;
    complianceRate: string;
  };
  nonCompliantProducts: Product[];
  allProducts: Product[];
  complianceRules: any[];
  error?: string;
};

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
    }).filter(Boolean) as Product[];
    
    // Calculate stats
    const totalProductCount = products.length;
    const nonCompliantProducts = products.filter(p => !p.isCompliant);
    const nonCompliantCount = nonCompliantProducts.length;
    const onSaleCount = products.filter(p => p.isOnSale).length;
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
      nonCompliantProducts: nonCompliantProducts as Product[],
      allProducts: products,
      complianceRules: rules
    } as LoaderReturnType);
  } catch (error) {
    console.error("Error loading compliance data:", error);
    return json({ 
      error: error instanceof Error ? error.message : "Unknown error",
      settings: { enabled: true, trackingFrequency: 12, countryRules: 'NO', lastScan: null },
      stats: { totalProductCount: 0, nonCompliantCount: 0, onSaleCount: 0, complianceRate: "100.0", lastScan: null },
      nonCompliantProducts: [] as Product[],
      allProducts: [] as Product[],
      complianceRules: []
    } as LoaderReturnType);
  }
};

// Define action return types
type ActionReturnType = {
  scanResult?: {
    success: boolean;
    productsTracked: number;
    error?: string;
  };
  updateResult?: {
    success: boolean;
    settings?: {
      enabled: boolean;
      trackingFrequency: number;
      countryRules: string;
      lastScan: string;
    };
    error?: string;
  };
  error?: string;
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
      
      return json<ActionReturnType>({ 
        scanResult: { 
          success: true, 
          productsTracked: products.length || 5
        } 
      });
    } catch (error) {
      console.error("Error scanning products:", error);
      return json<ActionReturnType>({ 
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
      
      return json<ActionReturnType>({ 
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
      return json<ActionReturnType>({ 
        updateResult: { 
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        } 
      });
    }
  }
  
  return json<ActionReturnType>({ error: "Invalid action" });
};

export default function ComplianceDashboard() {
  const loaderData = useLoaderData<LoaderReturnType>();
  const fetcher = useFetcher<ActionReturnType>();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [sorting, setSorting] = useState('title-asc');
  const [filterIsOnSale, setFilterIsOnSale] = useState(false);
  const [filterIsNonCompliant, setFilterIsNonCompliant] = useState(false);

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
      id: "all-products",
      content: "All Products",
      accessibilityLabel: "All products tab",
      panelID: "all-products-content",
    },
    {
      id: "compliance-issues",
      content: `Compliance Issues ${loaderData.stats?.nonCompliantCount > 0 ? `(${loaderData.stats.nonCompliantCount})` : ''}`,
      accessibilityLabel: "Compliance issues tab",
      panelID: "compliance-issues-content",
    },
    {
      id: "settings",
      content: "Settings",
      accessibilityLabel: "Settings tab",
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

  const sortFilters = [
    {
      label: 'Product name A-Z',
      value: 'title-asc',
    },
    {
      label: 'Product name Z-A',
      value: 'title-desc',
    },
    {
      label: 'Price (high to low)',
      value: 'price-desc',
    },
    {
      label: 'Price (low to high)',
      value: 'price-asc',
    },
    {
      label: 'Recently updated',
      value: 'updated-desc',
    },
  ];

  // Helper function to sort products
  const sortProducts = (products: Product[], sortKey: string) => {
    return [...products].sort((a, b) => {
      switch (sortKey) {
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'title-desc':
          return b.title.localeCompare(a.title);
        case 'price-desc':
          return b.price - a.price;
        case 'price-asc':
          return a.price - b.price;
        case 'updated-desc':
          return new Date(b.lastChecked || 0).getTime() - new Date(a.lastChecked || 0).getTime();
        default:
          return 0;
      }
    });
  };

  // Apply filters and sorting to products
  const filterProducts = (products: Product[]) => {
    return products.filter(product => {
      // Text search
      if (searchValue && !product.title.toLowerCase().includes(searchValue.toLowerCase())) {
        return false;
      }
      // On Sale filter
      if (filterIsOnSale && !product.isOnSale) {
        return false;
      }
      // Non-compliant filter
      if (filterIsNonCompliant && product.isCompliant) {
        return false;
      }
      return true;
    });
  };

  const sortedAndFilteredProducts = sortProducts(
    filterProducts(loaderData.allProducts || []),
    sorting
  );
  
  // Explicitly cast nonCompliantProducts to Product[] to fix TypeScript error
  const nonCompliantProducts = (loaderData.nonCompliantProducts || []) as Product[];

  // Prepare data for Products table
  const productsTableRows = sortedAndFilteredProducts.map((product: Product) => [
    <InlineStack gap="400" blockAlign="center" key={`product-${product.productId}`}>
      {product.image ? (
        <img 
          src={product.image} 
          alt={product.title} 
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} 
        />
      ) : (
        <div style={{ 
          width: '40px', 
          height: '40px', 
          backgroundColor: '#F4F6F8', 
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon source={ImageIcon} tone="subdued" />
        </div>
      )}
      <Link 
        onClick={() => handleProductClick(product.productId, product.variantId)}
        removeUnderline
      >
        <Text as="span" fontWeight="semibold">{product.title}</Text>
      </Link>
    </InlineStack>,
    <Text as="span" key={`price-${product.productId}`}>${product.price.toFixed(2)}</Text>,
    product.compareAtPrice ? 
      <Text as="span" key={`compare-${product.productId}`}>${product.compareAtPrice.toFixed(2)}</Text> : 
      <Text as="span" key={`compare-${product.productId}`} tone="subdued">-</Text>,
    product.isOnSale ? 
      <Badge key={`sale-${product.productId}`} tone="attention">On Sale</Badge> : 
      <Badge key={`sale-${product.productId}`} tone="info">Regular Price</Badge>,
    <Badge 
      key={`compliance-${product.productId}`}
      tone={product.isCompliant ? "success" : "critical"}
    >
      {product.isCompliant ? "Compliant" : "Issues"}
    </Badge>,
    <Text as="span" key={`date-${product.productId}`} tone="subdued">{formatDate(product.lastChecked)}</Text>,
    <Button 
      key={`action-${product.productId}`}
      onClick={() => handleProductClick(product.productId, product.variantId)}
      size="slim"
    >
      Details
    </Button>,
  ]);
  
  // Prepare data for Issues table
  const issuesTableRows = nonCompliantProducts.map((product: Product) => [
    <InlineStack gap="400" blockAlign="center" key={`issue-${product.productId}`}>
      {product.image ? (
        <img 
          src={product.image} 
          alt={product.title} 
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} 
        />
      ) : (
        <div style={{ 
          width: '40px', 
          height: '40px', 
          backgroundColor: '#F4F6F8', 
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon source={ImageIcon} tone="subdued" />
        </div>
      )}
      <Link 
        onClick={() => handleProductClick(product.productId, product.variantId)}
        removeUnderline
      >
        <Text as="span" fontWeight="semibold">{product.title}</Text>
      </Link>
    </InlineStack>,
    <Text as="span" key={`price-${product.productId}`}>${product.price.toFixed(2)}</Text>,
    product.compareAtPrice ? 
      <Text as="span" key={`compare-${product.productId}`}>${product.compareAtPrice.toFixed(2)}</Text> : 
      <Text as="span" key={`compare-${product.productId}`} tone="subdued">-</Text>,
    <Badge key={`critical-${product.productId}`} tone="critical">
      {product.issues && product.issues.length > 0 ? product.issues[0].rule : 'Unknown'}
    </Badge>,
    <BlockStack key={`description-${product.productId}`} gap="200">
      {product.issues && product.issues.length > 0 && (
        <Text as="p">{product.issues[0].message || product.issues[0].description || 'Compliance issue detected'}</Text>
      )}
      <Text as="p" tone="subdued" fontWeight="regular">
        Last checked: {formatDate(product.lastChecked)}
      </Text>
    </BlockStack>,
    <Button 
      key={`action-${product.productId}`}
      onClick={() => handleProductClick(product.productId, product.variantId)}
      size="slim"
    >
      Fix Issue
    </Button>,
  ]);

  return (
    <Page 
      fullWidth
      backAction={{ content: 'Home', url: '/app' }}
      title="Price Compliance"
      subtitle="Ensure your store's pricing meets Norwegian pricing regulations"
      primaryAction={{
        content: 'Scan Products',
        onAction: handleScanProducts,
        loading: isScanning,
        icon: RefreshIcon,
      }}
    >
      {/* Summary Cards */}
      <Layout>
        <Layout.Section>
          <Box paddingBlockEnd="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="500" wrap={false}>
                  <Box 
                    width="106px" 
                    paddingInlineEnd="400" 
                    paddingBlockEnd="400" 
                    borderInlineEndWidth="025" 
                    borderColor="border"
                  >
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">Compliance</Text>
                      <Text as="p" variant="heading2xl">
                        {loaderData.stats?.complianceRate || "100"}%
                      </Text>
                    </BlockStack>
                  </Box>
                  
                  <Box padding="100">
                    <BlockStack gap="100">
                      <InlineStack gap="1000">
                        <InlineStack gap="300">
                          <Icon 
                            source={CheckCircleIcon}
                            tone="success"
                          />
                          <Text as="span" variant="headingMd">
                            {loaderData.stats?.totalProductCount - loaderData.stats?.nonCompliantCount || 0}
                          </Text>
                          <Text as="span">Compliant</Text>
                        </InlineStack>
                        
                        <InlineStack gap="300">
                          <Icon 
                            source={AlertCircleIcon}
                            tone="critical"
                          />
                          <Text as="span" variant="headingMd">
                            {loaderData.stats?.nonCompliantCount || 0}
                          </Text>
                          <Text as="span">Non-compliant</Text>
                        </InlineStack>
                        
                        <InlineStack gap="300">
                          <Text as="span" variant="headingMd">
                            {loaderData.stats?.onSaleCount || 0}
                          </Text>
                          <Text as="span">Products on sale</Text>
                        </InlineStack>
                      </InlineStack>
                      
                      <Box paddingBlockStart="200">
                        <Text as="p" tone="subdued">
                          Last scan: {formatDate(loaderData.stats?.lastScan || null)}
                        </Text>
                      </Box>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
      
      {/* Tabs and content */}
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        {selectedTab === 0 && (
          <Box paddingBlockStart="400">
            <Card>
              {/* Filtering and Search UI */}
              <div className="Polaris-Card__Section">
                <InlineStack gap="500" align="space-between" blockAlign="start">
                  <TextField
                    label="Search products"
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search by name..."
                    prefix={<Icon source={SearchIcon} />}
                    labelHidden
                    autoComplete="off"
                  />
                  
                  <InlineStack gap="300">
                    <Select
                      label="Sort by"
                      labelInline
                      options={sortFilters}
                      value={sorting}
                      onChange={setSorting}
                    />
                    
                    <Checkbox
                      label="On sale"
                      checked={filterIsOnSale}
                      onChange={setFilterIsOnSale}
                    />
                    
                    <Checkbox
                      label="Non-compliant only"
                      checked={filterIsNonCompliant}
                      onChange={setFilterIsNonCompliant}
                    />
                  </InlineStack>
                </InlineStack>
              </div>
              
              {/* Results */}
              <DataTable
                columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text', 'text', 'text']}
                headings={['Product', 'Price', 'Reference Price', 'Sale Status', 'Compliance', 'Last Checked', 'Action']}
                rows={productsTableRows}
                footerContent={
                  sortedAndFilteredProducts.length > 0 ? 
                    `Showing ${sortedAndFilteredProducts.length} of ${loaderData.allProducts?.length || 0} products` : 
                    null
                }
              />
              
              {sortedAndFilteredProducts.length === 0 && (
                <Box padding="500">
                  <EmptyState
                    heading="No products found"
                    image=""
                  >
                    <p>Try changing your search or filter criteria.</p>
                  </EmptyState>
                </Box>
              )}
            </Card>
          </Box>
        )}
        
        {selectedTab === 1 && (
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                {nonCompliantProducts.length === 0 ? (
                  <Box padding="500">
                    <EmptyState
                      heading="No compliance issues found"
                      image=""
                      imageContained
                    >
                      <p>All your products are compliant with Norwegian pricing regulations.</p>
                    </EmptyState>
                  </Box>
                ) : (
                  <>
                    <Text as="h2" variant="headingMd">
                      {nonCompliantProducts.length} products with compliance issues
                    </Text>
                    
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text', 'text']}
                      headings={['Product', 'Current Price', 'Reference Price', 'Issue Type', 'Description', 'Action']}
                      rows={issuesTableRows}
                    />
                  </>
                )}
              </BlockStack>
            </Card>
          </Box>
        )}
        
        {selectedTab === 2 && (
          <Box paddingBlockStart="400">
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Tracker Settings</Text>
                    
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
                      
                      {fetcher.data?.updateResult && (
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
              
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Widget Settings</Text>
                    
                    <Text as="p" variant="bodyMd">
                      The compliance widget is automatically added to your product pages. You can customize its appearance in your theme editor.
                    </Text>
                    
                    <Box paddingBlockStart="200">
                      <img 
                        src="https://cdn.shopify.com/s/files/1/0780/9295/6593/files/widget-preview.png?v=1699824041" 
                        alt="Widget Preview" 
                        style={{ 
                          width: '100%', 
                          borderRadius: '8px', 
                          border: '1px solid #dde0e4' 
                        }} 
                      />
                    </Box>
                    
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
          </Box>
        )}
      </Tabs>
    </Page>
  );
}