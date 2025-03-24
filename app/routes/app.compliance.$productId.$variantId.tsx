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
  EmptyState,
  Tooltip,
  Icon,
  Link,
  Box
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { 
  AlertCircleIcon, 
  CheckCircleIcon, 
  ChartVerticalIcon
} from '@shopify/polaris-icons';

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Define types for compliance issues
interface ComplianceIssue {
  rule: string;
  message: string;
}

// Define types for price history entry
interface PriceHistoryEntry {
  date: string;
  price: number;
  compareAtPrice: number | null;
  isReference: boolean;
}

// Define types for sales period
interface SalesPeriod {
  start: Date;
  end: Date;
}

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
          variants(first: 1, query: "id:${variantId}") {
            edges {
              node {
                title
                price
                compareAtPrice
              }
            }
          }
        }
      }
    `);
    
    const responseJson = await response.json();
    const product = responseJson.data?.product;
    
    if (!product || !product.variant) {
      return json({ error: "Product or variant not found" });
    }
    
    // Get compliance data
    const productCompliance = await prisma.productCompliance.findUnique({
      where: {
        shop_productId_variantId: {
          shop: session.shop,
          productId,
          variantId
        }
      }
    });
    
    // Get price history
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90); // Get 90 days of history for better visualization
    
    const priceHistory = await prisma.priceHistory.findMany({
      where: {
        shop: session.shop,
        productId,
        variantId,
        timestamp: {
          gte: thirtyDaysAgo
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    });
    
    // Format price history for chart
    const formattedPriceHistory = priceHistory.map(entry => ({
      date: entry.timestamp.toISOString().split('T')[0],
      price: entry.price,
      compareAtPrice: entry.compareAtPrice || null,
      isReference: entry.isReference
    }));
    
    // For sales frequency detection, look for periods when the product wasn't on sale
    const salesPeriods: SalesPeriod[] = [];
    let currentPeriod: SalesPeriod | null = null;
    
    for (const entry of priceHistory) {
      const isOnSale = entry.compareAtPrice !== null && entry.compareAtPrice > entry.price;
      
      if (isOnSale && !currentPeriod) {
        // Start of a new sale period
        currentPeriod = {
          start: entry.timestamp,
          end: entry.timestamp
        };
      } else if (isOnSale && currentPeriod) {
        // Continuing sale period
        currentPeriod.end = entry.timestamp;
      } else if (!isOnSale && currentPeriod) {
        // End of a sale period
        salesPeriods.push(currentPeriod);
        currentPeriod = null;
      }
    }
    
    // Add the current period if it's still ongoing
    if (currentPeriod) {
      salesPeriods.push(currentPeriod);
    }
    
    // Map compliance issues
    let complianceIssues: ComplianceIssue[] = [];
    try {
      complianceIssues = productCompliance?.issues ? JSON.parse(productCompliance.issues) : [];
    } catch (e) {
      console.error("Error parsing compliance issues:", e);
      complianceIssues = [];
    }
    
    // Determine specific compliance statuses
    const førprisCompliant = !complianceIssues.some(issue => issue.rule === 'førpris');
    const saleDurationCompliant = !complianceIssues.some(issue => issue.rule === 'saleDuration');
    const saleFrequencyCompliant = !complianceIssues.some(issue => issue.rule === 'saleFrequency');
    
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
      compliance: productCompliance ? {
        isCompliant: productCompliance.isCompliant,
        isOnSale: productCompliance.isOnSale,
        referencePrice: productCompliance.referencePrice,
        saleStartDate: productCompliance.saleStartDate,
        lastChecked: productCompliance.lastChecked,
        issues: complianceIssues
      } : {
        isCompliant: true,
        isOnSale: false,
        referencePrice: null,
        saleStartDate: null,
        lastChecked: new Date(),
        issues: []
      },
      priceHistory: formattedPriceHistory,
      salesPeriods,
      complianceStatus: {
        førprisCompliant,
        saleDurationCompliant,
        saleFrequencyCompliant
      }
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
  
  const { product, compliance, priceHistory, salesPeriods, complianceStatus } = loaderData;
  
  // Define type for compliance to help TypeScript understand its structure
  type ComplianceData = {
    isCompliant: boolean;
    isOnSale: boolean;
    referencePrice: number | null;
    saleStartDate: string | Date | null;
    lastChecked: string | Date;
    issues: ComplianceIssue[];
  };
  const isOnSale = product.variant.compareAtPrice && product.variant.compareAtPrice > product.variant.price;
  
  // Format dates for display
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  // Prepare price history for SVG chart
  const prepareChartData = () => {
    if (priceHistory.length === 0) return null;
    
    const width = 600;
    const height = 200;
    const padding = 40;
    
    // Find min and max values for scaling
    const prices = priceHistory.map(entry => entry.price);
    const comparePrices = priceHistory
      .filter(entry => entry.compareAtPrice !== null)
      .map(entry => entry.compareAtPrice || 0);
    
    const allPrices = [...prices, ...comparePrices];
    const minPrice = Math.min(...allPrices) * 0.9; // 10% padding
    const maxPrice = Math.max(...allPrices) * 1.1; // 10% padding
    
    // Prepare axes
    const xScale = (i: number) => padding + ((width - 2 * padding) * i / (priceHistory.length - 1));
    const yScale = (price: number) => height - padding - ((height - 2 * padding) * (price - minPrice) / (maxPrice - minPrice));
    
    // Generate regular price line
    const priceLine = priceHistory.map((entry, i) => {
      return `${xScale(i)},${yScale(entry.price)}`;
    }).join(' ');
    
    // Generate reference price line (if applicable)
    const compareAtPriceLine = priceHistory
      .filter(entry => entry.compareAtPrice !== null)
      .map((entry, i) => {
        const originalIndex = priceHistory.findIndex(e => e.date === entry.date);
        return `${xScale(originalIndex)},${yScale(entry.compareAtPrice || 0)}`;
      }).join(' ');
    
    // Generate reference markers (red dots)
    const referenceMarkers = priceHistory
      .filter(entry => entry.isReference)
      .map(entry => {
        const originalIndex = priceHistory.findIndex(e => e.date === entry.date);
        return {
          cx: xScale(originalIndex),
          cy: yScale(entry.price),
          r: 4
        };
      });
    
    // Generate date labels (show every 15th day)
    const dateLabels = priceHistory
      .filter((_, i) => i % 15 === 0 || i === priceHistory.length - 1)
      .map(entry => {
        const originalIndex = priceHistory.findIndex(e => e.date === entry.date);
        const dateFormatted = formatDate(entry.date).split(' ')[0]; // Just show the day-month
        return {
          x: xScale(originalIndex),
          y: height - padding / 2,
          text: dateFormatted
        };
      });
    
    // Find where sale periods start (for annotations)
    const saleStartMarkers = salesPeriods.map(period => {
      // After JSON serialization/deserialization, Date objects become strings
      // So we should always convert to a Date object first, then to ISO string format
      const startDate = new Date(period.start).toISOString().split('T')[0];
        
      const index = priceHistory.findIndex(entry => entry.date === startDate);
      if (index === -1) return null;
      
      return {
        x: xScale(index),
        y: 20,
        text: "Sale Start",
        line: {
          x1: xScale(index),
          y1: 30,
          x2: xScale(index),
          y2: height - padding
        }
      };
    }).filter(Boolean);
    
    return {
      width,
      height,
      minPrice,
      maxPrice,
      priceLine,
      compareAtPriceLine,
      referenceMarkers,
      dateLabels,
      saleStartMarkers
    };
  };
  
  const chartData = prepareChartData();
  
  // Prepare price history for table
  const priceHistoryRows = priceHistory
    .filter((_, i) => i % 5 === 0 || i === priceHistory.length - 1) // Show every 5th day for brevity
    .map((entry: PriceHistoryEntry) => [
      formatDate(entry.date),
      `${entry.price.toFixed(2)}`,
      entry.compareAtPrice ? `${entry.compareAtPrice.toFixed(2)}` : "None",
      entry.compareAtPrice && entry.price < entry.compareAtPrice ? 
        "Yes" : 
        "No",
      entry.isReference ? 
        "Reference" : 
        ""
    ]);
  
  // Calculate sale duration if on sale
  let saleDuration = "N/A";
  // Use optional chaining to safely access saleStartDate which might not exist on all types of 'compliance'
  if (compliance?.saleStartDate) {
    const startDate = new Date(compliance.saleStartDate);
    const today = new Date();
    const durationDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    saleDuration = `${durationDays} days`;
  }
  
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
                    <Text as="span" variant="bodyMd" fontWeight="bold">Reference Price</Text>
                    <Text as="p" variant="headingMd">
                      {product.variant.compareAtPrice ? product.variant.compareAtPrice.toFixed(2) : "None"}
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text as="span" variant="bodyMd" fontWeight="bold">On Sale</Text>
                    <Text as="span">
                      <Badge tone={isOnSale ? "attention" : "info"}>
                        {isOnSale ? "Yes" : "No"}
                      </Badge>
                    </Text>
                  </BlockStack>
                  
                  {isOnSale && (
                    <BlockStack gap="200">
                      <Text as="span" variant="bodyMd" fontWeight="bold">Sale Duration</Text>
                      <Text as="p" variant="bodyMd">{saleDuration}</Text>
                    </BlockStack>
                  )}
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
                <Text as="h2" variant="headingMd">Compliance Status</Text>
                
                <Banner tone={compliance.isCompliant ? "success" : "critical"}>
                  <Text as="p" fontWeight="bold">
                    {compliance.isCompliant 
                      ? "This product is compliant with pricing regulations" 
                      : "This product has compliance issues that need attention"}
                  </Text>
                </Banner>
                
                <BlockStack gap="400">
                  <DataTable
                    columnContentTypes={['text', 'text']}
                    headings={['Compliance Rule', 'Status']}
                    rows={[
                      [
                        <InlineStack gap="200" align="center" key="forpris-label">
                          <Text as="span" fontWeight="bold">Reference Price (Førpris)</Text>
                          <Tooltip content="The reference price must be the lowest price used in the 30 days before the sale">
                            <Icon source={AlertCircleIcon} tone="subdued" />
                          </Tooltip>
                        </InlineStack>,
                        <div key="forpris-status">
                          <Badge tone={complianceStatus.førprisCompliant ? "success" : "critical"}>
                            {complianceStatus.førprisCompliant ? "Compliant" : "Non-compliant"}
                          </Badge>
                          <InlineStack gap="200" align="center">
                            <Icon source={complianceStatus.førprisCompliant ? CheckCircleIcon : AlertCircleIcon} tone={complianceStatus.førprisCompliant ? "success" : "critical"} />
                            <Text as="span">{complianceStatus.førprisCompliant ? "Compliant" : "Non-compliant"}</Text>
                          </InlineStack>
                        </div>
                      ],
                      [
                        <InlineStack gap="200" align="center" key="duration-label">
                          <Text as="span" fontWeight="bold">Sale Duration</Text>
                          <Tooltip content="Sales should not last longer than 30% of the year (~110 days)">
                          <Icon source={AlertCircleIcon} tone="subdued" />
                          </Tooltip>
                        </InlineStack>,
                        <div key="duration-status">
                          <Badge tone={complianceStatus.saleDurationCompliant ? "success" : "critical"}>
                            {complianceStatus.saleDurationCompliant ? "Compliant" : "Non-compliant"}
                          </Badge>
                          <InlineStack gap="200" align="center">
                            <Icon source={complianceStatus.saleDurationCompliant ? CheckCircleIcon : AlertCircleIcon} tone={complianceStatus.saleDurationCompliant ? "success" : "critical"} />
                            <Text as="span">{complianceStatus.saleDurationCompliant ? "Compliant" : "Non-compliant"}</Text>
                          </InlineStack>
                        </div>
                      ],
                      [
                        <InlineStack gap="200" align="center" key="frequency-label">
                          <Text as="span" fontWeight="bold">Sales Frequency</Text>
                          <Tooltip content="A sufficient period must pass between sales of the same product">
                          <Icon source={AlertCircleIcon} tone="subdued" />
                          </Tooltip>
                        </InlineStack>,
                        <div key="frequency-status">
                          <Badge tone={complianceStatus.saleFrequencyCompliant ? "success" : "critical"}>
                            {complianceStatus.saleFrequencyCompliant ? "Compliant" : "Non-compliant"}
                          </Badge>
                          <InlineStack gap="200" align="center">
                            <Icon source={complianceStatus.saleFrequencyCompliant ? CheckCircleIcon : AlertCircleIcon} tone={complianceStatus.saleFrequencyCompliant ? "success" : "critical"} />
                            <Text as="span">{complianceStatus.saleFrequencyCompliant ? "Compliant" : "Non-compliant"}</Text>
                          </InlineStack>
                        </div>
                      ]
                    ]}
                  />
                  
                  {compliance.issues && compliance.issues.length > 0 && (
                    <BlockStack gap="400">
                      <Text as="h3" variant="headingMd">Compliance Issues</Text>
                      <Banner tone="warning">
                        <BlockStack gap="400">
                          {compliance.issues.map((issue: ComplianceIssue, index: number) => (
                            <BlockStack gap="200" key={index}>
                              <Text as="p" fontWeight="bold">{issue.rule} rule violation:</Text>
                              <Text as="p">{issue.message}</Text>
                            </BlockStack>
                          ))}
                          
                          <Link url="https://forbrukertilsynet.no/veiledning-om-reglene-som-gjelder-ved-markedsforing-av-salg-og-betingede-tilbud" external>
                            View Norwegian pricing regulations
                          </Link>
                        </BlockStack>
                      </Banner>
                    </BlockStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                                  <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Price History</Text>
                  <Icon source={ChartVerticalIcon} tone="base" />
                </InlineStack>
                
                {priceHistory.length === 0 ? (
                  <EmptyState
                    heading="No price history"
                    image=""
                  >
                    <p>No price history has been recorded for this product yet.</p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="600">
                    {/* SVG Chart */}
                    {chartData && (
                      <Box paddingBlockEnd="400">
                        <svg width="100%" height={chartData.height} viewBox={`0 0 ${chartData.width} ${chartData.height}`} style={{maxWidth: "100%"}}>
                          {/* X and Y axes */}
                          <line x1="40" y1="40" x2="40" y2="160" stroke="#ddd" strokeWidth="1" />
                          <line x1="40" y1="160" x2="560" y2="160" stroke="#ddd" strokeWidth="1" />
                          
                          {/* Sale start markers */}
                          {chartData.saleStartMarkers?.map((marker, i) => (
                            marker && (
                              <g key={`start-${i}`}>
                                <line
                                  x1={marker.line.x1}
                                  y1={marker.line.y1}
                                  x2={marker.line.x2}
                                  y2={marker.line.y2}
                                  stroke="#5c6ac4"
                                  strokeWidth="1"
                                  strokeDasharray="4,4"
                                />
                                <text
                                  x={marker.x}
                                  y={marker.y}
                                  fontSize="10"
                                  textAnchor="middle"
                                  fill="#5c6ac4"
                                >
                                  {marker.text}
                                </text>
                              </g>
                            )
                          ))}
                          
                          {/* Date labels */}
                          {chartData.dateLabels.map((label, i) => (
                            <text
                              key={`date-${i}`}
                              x={label.x}
                              y={label.y}
                              fontSize="10"
                              textAnchor="middle"
                              fill="#637381"
                            >
                              {label.text}
                            </text>
                          ))}
                          
                          {/* Price labels */}
                          <text x="35" y="45" fontSize="10" textAnchor="end" fill="#637381">
                            {chartData.maxPrice.toFixed(0)}
                          </text>
                          <text x="35" y="160" fontSize="10" textAnchor="end" fill="#637381">
                            {chartData.minPrice.toFixed(0)}
                          </text>
                          
                          {/* Compare-at price line */}
                          {chartData.compareAtPriceLine && (
                            <polyline
                              points={chartData.compareAtPriceLine}
                              fill="none"
                              stroke="#637381"
                              strokeWidth="2"
                              strokeDasharray="4,4"
                            />
                          )}
                          
                          {/* Regular price line */}
                          <polyline
                            points={chartData.priceLine}
                            fill="none"
                            stroke="#008060"
                            strokeWidth="2"
                          />
                          
                          {/* Reference points */}
                          {chartData.referenceMarkers.map((marker, i) => (
                            <circle
                              key={`ref-${i}`}
                              cx={marker.cx}
                              cy={marker.cy}
                              r={marker.r}
                              fill="red"
                            />
                          ))}
                          
                          {/* Legend */}
                          <g transform="translate(450, 40)">
                            <rect x="0" y="0" width="100" height="50" fill="white" fillOpacity="0.8" rx="4" />
                            <line x1="10" y1="15" x2="30" y2="15" stroke="#008060" strokeWidth="2" />
                            <text x="35" y="18" fontSize="10" fill="#637381">Current Price</text>
                            
                            <line x1="10" y1="35" x2="30" y2="35" stroke="#637381" strokeWidth="2" strokeDasharray="4,4" />
                            <text x="35" y="38" fontSize="10" fill="#637381">Reference Price</text>
                          </g>
                        </svg>
                      </Box>
                    )}
                    
                    <Text as="h3" variant="headingMd">Detailed Price History</Text>
                    
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text']}
                      headings={['Date', 'Price', 'Reference Price', 'On Sale', 'Status']}
                      rows={priceHistoryRows}
                    />
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}