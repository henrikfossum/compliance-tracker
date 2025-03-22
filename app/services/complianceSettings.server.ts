// app/services/complianceSettings.server.ts
import prisma from "../db.server";

/**
 * Gets compliance settings for a shop
 */
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
          trackingFrequency: 12, // Default to checking every 12 hours
          countryRules: 'NO' // Default to Norwegian rules
        }
      });
    }
    
    return { success: true, settings };
  } catch (error) {
    console.error(`Error getting shop settings for ${shop}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Updates compliance settings for a shop
 */
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
    return { success: false, error: error.message };
  }
}

/**
 * Initialize default compliance rules
 */
export async function initializeDefaultRules() {
  try {
    // Check if we have Norwegian rules already
    const existingRules = await prisma.complianceRule.findMany({
      where: { countryCode: 'NO' }
    });
    
    if (existingRules.length > 0) {
      return { success: true, message: 'Rules already exist' };
    }
    
    // Create default Norwegian rules
    await prisma.complianceRule.createMany({
      data: [
        {
          countryCode: 'NO',
          ruleType: 'førpris',
          parameters: JSON.stringify({
            minDays: 30,
            requireLowestPrice: true
          }),
          description: 'Reference price must be the lowest price from the last 30 days',
          active: true
        },
        {
          countryCode: 'NO',
          ruleType: 'salesDuration',
          parameters: JSON.stringify({
            maxDays: 56 // 8 weeks
          }),
          description: 'Sales should not last longer than 8 weeks',
          active: true
        },
        {
          countryCode: 'NO',
          ruleType: 'salesFrequency',
          parameters: JSON.stringify({
            minDaysBetween: 28 // 4 weeks
          }),
          description: 'There should be at least 4 weeks between sales periods',
          active: true
        }
      ]
    });
    
    return { success: true, message: 'Default rules created' };
  } catch (error) {
    console.error('Error initializing default rules:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets all available compliance rules
 */
export async function getComplianceRules(countryCode?: string) {
  try {
    const rules = await prisma.complianceRule.findMany({
      where: countryCode ? { countryCode } : undefined,
      orderBy: [
        { countryCode: 'asc' },
        { ruleType: 'asc' }
      ]
    });
    
    return { success: true, rules };
  } catch (error) {
    console.error('Error getting compliance rules:', error);
    return { success: false, error: error.message };
  }
}