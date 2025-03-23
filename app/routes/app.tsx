import { useMemo, useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useLocation } from "@remix-run/react";
import { AppProvider as PolarisAppProvider, Frame, Navigation, TopBar, Icon } from "@shopify/polaris";
import { HomeIcon, ChartVerticalIcon } from '@shopify/polaris-icons';
import { useAppBridge } from "@shopify/app-bridge-react";
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
  const navigate = useNavigate();
  const app = useAppBridge();
  const [mobileNavigationActive, setMobileNavigationActive] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleMobileNavigationActive = () => {
    setMobileNavigationActive((active) => !active);
  };

  const handleUserMenuToggle = useCallback(() => {
    setUserMenuOpen((prevState) => !prevState);
  }, []);

  const navigationMarkup = useMemo(
    () => (
      <Navigation location={location.pathname}>
        <Navigation.Section
          items={[
            {
              label: 'Home',
              icon: HomeIcon,
              onClick: () => navigate('/app'),
              selected: location.pathname === '/app',
            },
            {
              label: 'Compliance',
              icon: ChartVerticalIcon,
              onClick: () => navigate('/app/compliance'),
              selected: location.pathname.includes('/app/compliance'),
            },
          ]}
        />
        <Navigation.Section
          title="Tools"
          items={[
            {
              label: 'Create Demo Data',
              onClick: () => navigate('/app/populate-demo-data'),
              selected: location.pathname === '/app/populate-demo-data',
            },
          ]}
        />
      </Navigation>
    ),
    [location.pathname, navigate]
  );
  
  
  const userMenuActions = [
    {
      items: [{ content: 'Back to Shopify', icon: HomeIcon }],
    },
    {
      items: [{ content: 'Community forums' }],
    },
  ];


  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Frame
        navigation={navigationMarkup}
        showMobileNavigation={mobileNavigationActive}
        onNavigationDismiss={toggleMobileNavigationActive}
        topBar={
          <TopBar
            showNavigationToggle
            onNavigationToggle={toggleMobileNavigationActive}
            userMenu={
              <TopBar.UserMenu
                name="Price Compliance"
                detail={shop}
                initials="PC"
                actions={userMenuActions}
                open={userMenuOpen}
                onToggle={handleUserMenuToggle}
              />
            }
            secondaryMenu={
              <div style={{ padding: "0 16px", fontSize: "14px", color: "#637381" }}>
                Price Compliance Tracker
              </div>
            }
          />
        }
      >
        <Outlet />
      </Frame>
    </PolarisAppProvider>
  );
}
