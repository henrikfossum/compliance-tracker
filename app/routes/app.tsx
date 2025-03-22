// app/routes/app.tsx
import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import {
  NavigationMenu,
  Link,
  AppProvider,
  Frame,
  TopBar,
} from "@shopify/polaris";
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";
import { PlusIcon, HomeMajor, ChecklistMajor, SettingsMajor } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "", shop: session.shop });
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
  const [mobileNavActive, setMobileNavActive] = useState(false);

  const toggleMobileNavActive = () => {
    setMobileNavActive((active) => !active);
  };

  const navigationMarkup = (
    <NavigationMenu
      activePath="/app"
      onNavigationDismiss={toggleMobileNavActive}
    >
      <NavigationMenu.Section
        items={[
          {
            label: "Home",
            icon: HomeMajor,
            url: "/app",
            selected: false,
          },
          {
            label: "Compliance",
            icon: ChecklistMajor,
            url: "/app/compliance",
            selected: false,
          },
        ]}
      />
    </NavigationMenu>
  );

  return (
    <AppProvider
      i18n={{}}
      isEmbeddedApp
    >
      <AppBridgeProvider
        config={{
          apiKey,
          host: new URL(window.location.href).searchParams.get("host") || "",
          forceRedirect: true,
        }}
      >
        <Frame
          navigation={navigationMarkup}
          showMobileNavigation={mobileNavActive}
          onNavigationDismiss={toggleMobileNavActive}
        >
          <Outlet />
        </Frame>
      </AppBridgeProvider>
    </AppProvider>
  );
}