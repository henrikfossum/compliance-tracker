// app/routes/app.tsx
import { useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useLocation, Link } from "@remix-run/react";
import { 
  AppProvider as PolarisAppProvider, 
  Frame,
  Box,
  InlineStack,
  Text
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  });
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Navigation links
  const navLinks = [
    { label: 'Dashboard', path: '/app' },
    { label: 'Compliance', path: '/app/compliance' },
    { label: 'Demo Data', path: '/app/populate-demo-data' },
  ];

  // Check if a path is active
  const isActive = (path: string) => {
    if (path === '/app') return location.pathname === '/app';
    return location.pathname.includes(path);
  };

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Frame>
        {/* Ultra-compact pill navigation */}
        <div style={{ 
          padding: '8px 16px', 
          borderBottom: '1px solid #e1e3e5', 
          backgroundColor: '#f6f6f7'
        }}>
          <InlineStack gap="400" blockAlign="center" align="center">
            <div style={{ 
              display: 'inline-flex',
              background: 'white', 
              padding: '2px',
              borderRadius: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
            }}>
              {navLinks.map(link => (
                <Link 
                  key={link.label}
                  to={link.path}
                  style={{
                    color: isActive(link.path) ? '#ffffff' : '#637381',
                    background: isActive(link.path) ? '#008060' : 'transparent',
                    padding: '6px 16px',
                    borderRadius: '16px',
                    fontSize: '13px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                    display: 'block'
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            
            <div style={{ marginLeft: 'auto' }}>
              <Text as="span" variant="bodySm" tone="subdued">
                {shop}
              </Text>
            </div>
          </InlineStack>
        </div>

        {/* Main Content */}
        <Box padding="400">
          <Outlet />
        </Box>
      </Frame>
    </PolarisAppProvider>
  );
}