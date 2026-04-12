// backend/src/seeders/wordPackages.seeder.ts - Default Word Packages Setup
import WordPackage from '../models/wordPackage.model';
import logger from '../config/logger';

export const defaultWordPackages = [
  {
    packageId: 'starter-25k',
    name: 'Starter Pack',
    description: 'Perfect for trying out our platform with basic content needs',
    wordCount: 25000,
    priceInCents: 1500000, // ₦15,000 (in kobo)
    pricePerWord: 60, // ✅ ADDED: 1500000 / 25000
    currency: 'NGN',
    isActive: true,
    isPopular: false,
    features: [
      '25,000 word credits',
      'All AI models available',
      'WordPress publishing',
      'Basic support',
      'Credits never expire'
    ],
    validityDays: null
  },
  {
    packageId: 'professional-100k',
    name: 'Professional Pack',
    description: 'Best value for regular content creators and small businesses',
    wordCount: 100000,
    priceInCents: 4000000, // ₦40,000 (in kobo)
    pricePerWord: 40, // ✅ ADDED: 4000000 / 100000
    currency: 'NGN',
    isActive: true,
    isPopular: true,
    features: [
      '100,000 word credits',
      'All AI models available',
      'WordPress publishing',
      'Priority support',
      'Advanced customization',
      'Credits never expire'
    ],
    validityDays: null,
    discountPercentage: 37
  },
  {
    packageId: 'business-300k',
    name: 'Business Pack',
    description: 'Ideal for growing businesses and content teams',
    wordCount: 300000,
    priceInCents: 9000000, // ₦90,000 (in kobo)
    pricePerWord: 30, // ✅ ADDED: 9000000 / 300000
    currency: 'NGN',
    isActive: true,
    isPopular: false,
    features: [
      '300,000 word credits',
      'All AI models available',
      'WordPress publishing',
      'Priority support',
      'Advanced customization',
      'Bulk operations',
      'Team collaboration',
      'Credits never expire'
    ],
    validityDays: null,
    discountPercentage: 52
  },
  {
    packageId: 'enterprise-1m',
    name: 'Enterprise Pack',
    description: 'Maximum value for large organizations',
    wordCount: 1000000,
    priceInCents: 22000000, // ₦220,000 (in kobo)
    pricePerWord: 22, // ✅ ADDED: 22000000 / 1000000
    currency: 'NGN',
    isActive: true,
    isPopular: false,
    features: [
      '1,000,000 word credits',
      'All AI models available',
      'WordPress publishing',
      'Dedicated support',
      'Advanced customization',
      'Bulk operations',
      'Team collaboration',
      'API access',
      'White-label options',
      'Credits never expire'
    ],
    validityDays: null,
    discountPercentage: 63
  }
];

export const seedWordPackages = async (): Promise<void> => {
  try {
    logger.info('Starting word packages seeding...');

    // Clear existing packages
    await WordPackage.deleteMany({});
    logger.info('Cleared existing word packages');

    // Insert new packages
    const packages = await WordPackage.insertMany(defaultWordPackages);
    logger.info(`Successfully seeded ${packages.length} word packages`);

    // Log package details for verification
    packages.forEach(pkg => {
      logger.info(`Created package: ${pkg.name} - ${pkg.wordCount.toLocaleString()} words for ${pkg.getFormattedPrice()}`);
    });

    logger.info('Word packages seeding completed successfully');
  } catch (error: any) {
    logger.error('Error seeding word packages:', error);
    throw error;
  }
};

// Utility function to calculate pricing metrics
export const calculatePricingMetrics = () => {
  const baselinePrice = 0.6; // ₦0.60 per word (Starter pack rate)
  
  defaultWordPackages.forEach(pkg => {
    const pricePerWord = pkg.priceInCents / 100 / pkg.wordCount;
    const savings = ((baselinePrice - pricePerWord) / baselinePrice) * 100;
    const formattedPrice = (pkg.priceInCents / 100).toLocaleString('en-NG', { 
      style: 'currency', 
      currency: 'NGN' 
    });
    
    console.log(`${pkg.name}:`);
    console.log(`  - ${pkg.wordCount.toLocaleString()} words for ${formattedPrice}`);
    console.log(`  - ₦${pricePerWord.toFixed(2)} per word`);
    console.log(`  - ${savings.toFixed(1)}% savings vs Starter rate`);
    console.log('');
  });
};

// Function to update package pricing (for admin use)
export const updatePackagePricing = async (packageId: string, newPriceInCents: number): Promise<void> => {
  try {
    const result = await WordPackage.findOneAndUpdate(
      { packageId },
      { priceInCents: newPriceInCents },
      { new: true }
    );

    if (result) {
      logger.info(`Updated ${packageId} pricing to ${result.getFormattedPrice()}`);
    } else {
      logger.warn(`Package ${packageId} not found for pricing update`);
    }
  } catch (error: any) {
    logger.error('Error updating package pricing:', error);
    throw error;
  }
};

// Function to enable/disable packages
export const togglePackageStatus = async (packageId: string, isActive: boolean): Promise<void> => {
  try {
    const result = await WordPackage.findOneAndUpdate(
      { packageId },
      { isActive },
      { new: true }
    );

    if (result) {
      logger.info(`Package ${packageId} ${isActive ? 'enabled' : 'disabled'}`);
    } else {
      logger.warn(`Package ${packageId} not found for status update`);
    }
  } catch (error: any) {
    logger.error('Error updating package status:', error);
    throw error;
  }
};

export default { seedWordPackages, calculatePricingMetrics, updatePackagePricing, togglePackageStatus };