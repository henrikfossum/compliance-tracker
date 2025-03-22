// app/services/complianceSettings.server.ts
import prisma from "../db.server";

export async function getShopSettings(shop: string) {
  try {
    // Try to get existing settings
    let settings = await prisma.shopSettings.findUnique({
      where: { shop }
    });
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = await prisma.shopSettings.create({
        data: {
          shop,
          enabled: true,
          trackingFrequency: 12,
          countryRules: 'NO'
        }
      });
    }
    
    return { success: true, settings };
  } catch (error) {
    console.error(`Error getting shop settings for ${shop}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "An unknown error occurred",
      settings: {
        enabled: true,
        trackingFrequency: 12,
        countryRules: 'NO'
      }
    };
  }
}

export async function updateShopSettings(shop: string, settings: {
  enabled?: boolean;
  trackingFrequency?: number;
  countryRules?: string;
}) {
  try {
    // Update or create settings
    const updatedSettings = await prisma.shopSettings.upsert({
      where: { shop },
      update: settings,
      create: {
        shop,
        enabled: settings.enabled ?? true,
        trackingFrequency: settings.trackingFrequency ?? 12,
        countryRules: settings.countryRules ?? 'NO'
      }
    });
    
    return { success: true, settings: updatedSettings };
  } catch (error) {
    console.error(`Error updating shop settings for ${shop}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "An unknown error occurred"
    };
  }
}