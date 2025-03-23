// app/routes/app.tsx
import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider, Frame } from "@shopify/polaris";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "", shop: session.shop });
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
  
  return (
    <AppProvider i18n={{}}>
      <div style={{ padding: '20px' }}>
        <div style={{ 
          display: 'flex', 
          gap: '20px', 
          marginBottom: '20px', 
          borderBottom: '1px solid #ddd',
          paddingBottom: '10px'
        }}>
          <a 
            href="/app" 
            style={{ 
              textDecoration: 'none',
              fontWeight: 'bold',
              padding: '8px 12px',
              borderRadius: '4px',
              backgroundColor: window.location.pathname === "/app" ? '#f5f5f5' : 'transparent'
            }}
          >
            Home
          </a>
          <a 
            href="/app/compliance" 
            style={{ 
              textDecoration: 'none',
              fontWeight: 'bold',
              padding: '8px 12px',
              borderRadius: '4px',
              backgroundColor: window.location.pathname.includes("/app/compliance") ? '#f5f5f5' : 'transparent'
            }}
          >
            Compliance
          </a>
        </div>
        <Outlet />
      </div>
    </AppProvider>
  );
}