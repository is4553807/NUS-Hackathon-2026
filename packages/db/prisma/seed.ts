import { getPrismaClient } from "../src/client.js";
import {
  DigitalDeliveryMethod,
  InventoryAvailability,
  MerchantStatus,
  ProductCategory,
  ServiceDeliveryMode,
} from "../src/generated/prisma/enums.js";
import type { Prisma } from "../src/generated/prisma/client.js";

const merchantIds = {
  sneakerHub: "11111111-1111-4111-8111-111111111111",
  kentRidgeSports: "22222222-2222-4222-8222-222222222222",
  digitalLearningLab: "33333333-3333-4333-8333-333333333333",
  careerStudio: "44444444-4444-4444-8444-444444444444",
  lionCityExperiences: "55555555-5555-4555-8555-555555555555",
} as const;

const productIds = {
  sneakerHubGtCut3: "a1111111-1111-4111-8111-111111111111",
  kentRidgeGtCut3: "a2222222-2222-4222-8222-222222222222",
  analyticsStarterKit: "a3333333-3333-4333-8333-333333333333",
  careerCoaching: "a4444444-4444-4444-8444-444444444444",
  sentosaKayaking: "a5555555-5555-4555-8555-555555555555",
} as const;

const merchants = [
  {
    id: merchantIds.sneakerHub,
    name: "NUS Sneaker Hub",
    category: "physical_goods",
    description: "Basketball footwear with same-day campus delivery.",
    currency: "SGD",
    contactEmail: "sneakers@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.kentRidgeSports,
    name: "Kent Ridge Sports",
    category: "physical_goods",
    description: "Campus sports equipment and footwear retailer.",
    currency: "SGD",
    contactEmail: "sports@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.digitalLearningLab,
    name: "NUS Digital Learning Lab",
    category: "digital_products",
    description: "Downloadable learning resources for university students.",
    currency: "SGD",
    contactEmail: "digital@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.careerStudio,
    name: "Campus Career Studio",
    category: "services",
    description: "Remote and in-person career development services.",
    currency: "SGD",
    contactEmail: "career@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.lionCityExperiences,
    name: "Lion City Experiences",
    category: "bookings_experiences",
    description: "Small-group activities and experiences around Singapore.",
    currency: "SGD",
    contactEmail: "experiences@example.com",
    status: MerchantStatus.ACTIVE,
  },
] satisfies Prisma.MerchantCreateManyInput[];

const products = [
  {
    id: productIds.sneakerHubGtCut3,
    merchantId: merchantIds.sneakerHub,
    name: "Nike GT Cut 3",
    description: "Responsive basketball shoes for fast court movement.",
    category: ProductCategory.PHYSICAL_GOODS,
    brand: "Nike",
    listedPrice: 195,
    currency: "SGD",
    imageUrl: null,
    active: true,
  },
  {
    id: productIds.kentRidgeGtCut3,
    merchantId: merchantIds.kentRidgeSports,
    name: "Nike GT Cut 3",
    description: "Basketball shoes available for campus pickup.",
    category: ProductCategory.PHYSICAL_GOODS,
    brand: "Nike",
    listedPrice: 195,
    currency: "SGD",
    imageUrl: null,
    active: true,
  },
  {
    id: productIds.analyticsStarterKit,
    merchantId: merchantIds.digitalLearningLab,
    name: "Data Analytics Starter Kit",
    description: "Downloadable templates, exercises, and reference notes.",
    category: ProductCategory.DIGITAL_PRODUCTS,
    brand: "NUS Digital Learning Lab",
    listedPrice: 39,
    currency: "SGD",
    imageUrl: null,
    active: true,
  },
  {
    id: productIds.careerCoaching,
    merchantId: merchantIds.careerStudio,
    name: "60-Minute Career Coaching",
    description: "One-to-one CV review and interview preparation session.",
    category: ProductCategory.SERVICES,
    brand: "Campus Career Studio",
    listedPrice: 80,
    currency: "SGD",
    imageUrl: null,
    active: true,
  },
  {
    id: productIds.sentosaKayaking,
    merchantId: merchantIds.lionCityExperiences,
    name: "Sentosa Sunset Kayaking",
    description: "Guided small-group sunset kayaking experience.",
    category: ProductCategory.BOOKINGS_EXPERIENCES,
    brand: "Lion City Experiences",
    listedPrice: 95,
    currency: "SGD",
    imageUrl: null,
    active: true,
  },
] satisfies Prisma.ProductCreateManyInput[];

const physicalGoodDetails = [
  {
    productId: productIds.sneakerHubGtCut3,
    sku: "NSH-GTC3-BLK",
    sizeOptions: ["US 8", "US 9", "US 10"],
    colorOptions: ["Black"],
    material: "Mesh and synthetic overlays",
    weightGrams: 390,
    lengthCm: 32,
    widthCm: 21,
    heightCm: 12,
    shippingRequired: true,
    metadata: {
      productType: "basketball_shoes",
      sport: "basketball",
      deliveryZone: "NUS campus",
    },
  },
  {
    productId: productIds.kentRidgeGtCut3,
    sku: "KRS-GTC3-BLK",
    sizeOptions: ["US 9", "US 10"],
    colorOptions: ["Black"],
    material: "Mesh and synthetic overlays",
    weightGrams: 390,
    lengthCm: 32,
    widthCm: 21,
    heightCm: 12,
    shippingRequired: false,
    metadata: {
      productType: "basketball_shoes",
      sport: "basketball",
      fulfilment: "campus_pickup",
    },
  },
] satisfies Prisma.PhysicalGoodDetailsCreateManyInput[];

const digitalProductDetails = [
  {
    productId: productIds.analyticsStarterKit,
    deliveryMethod: DigitalDeliveryMethod.DOWNLOAD,
    fileFormat: "ZIP/PDF/XLSX",
    fileSizeBytes: 52_428_800n,
    version: "2026.1",
    licenseRequired: true,
    accessDurationDays: 365,
    fulfillmentUrl: "https://example.com/demo/data-analytics-starter-kit",
    metadata: {
      productType: "learning_bundle",
      language: "English",
      level: "beginner",
    },
  },
] satisfies Prisma.DigitalProductDetailsCreateManyInput[];

const serviceDetails = [
  {
    productId: productIds.careerCoaching,
    serviceType: "career_coaching",
    deliveryMode: ServiceDeliveryMode.HYBRID,
    durationMinutes: 60,
    location: "NUS Central Library or remote video call",
    serviceAreas: ["NUS Kent Ridge", "Remote"],
    providerName: "Campus Career Studio Coach",
    bookingRequired: true,
    metadata: {
      includes: ["CV review", "mock interview", "action plan"],
      language: "English",
    },
  },
] satisfies Prisma.ServiceDetailsCreateManyInput[];

const bookingExperienceDetails = [
  {
    productId: productIds.sentosaKayaking,
    experienceType: "outdoor_activity",
    destination: "Sentosa, Singapore",
    venue: "Siloso Beach",
    startsAt: new Date("2026-09-05T17:30:00+08:00"),
    endsAt: new Date("2026-09-05T19:30:00+08:00"),
    timezone: "Asia/Singapore",
    capacity: 12,
    minParticipants: 2,
    meetingPoint: "Siloso Point ticketing kiosk",
    metadata: {
      difficulty: "beginner",
      equipmentIncluded: true,
      minimumAge: 12,
    },
  },
] satisfies Prisma.BookingExperienceDetailsCreateManyInput[];

const inventory = [
  {
    id: "b1111111-1111-4111-8111-111111111111",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    variantKey: "size=US 8;color=Black",
    quantityAvailable: 5,
    quantityReserved: 0,
    availability: InventoryAvailability.LOW_STOCK,
  },
  {
    id: "b1111111-1111-4111-8111-111111111112",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    variantKey: "size=US 9;color=Black",
    quantityAvailable: 2,
    quantityReserved: 0,
    availability: InventoryAvailability.LOW_STOCK,
  },
  {
    id: "b1111111-1111-4111-8111-111111111113",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    variantKey: "size=US 10;color=Black",
    quantityAvailable: 7,
    quantityReserved: 0,
    availability: InventoryAvailability.IN_STOCK,
  },
  {
    id: "b2222222-2222-4222-8222-222222222221",
    merchantId: merchantIds.kentRidgeSports,
    productId: productIds.kentRidgeGtCut3,
    variantKey: "size=US 9;color=Black",
    quantityAvailable: 25,
    quantityReserved: 0,
    availability: InventoryAvailability.IN_STOCK,
  },
  {
    id: "b2222222-2222-4222-8222-222222222222",
    merchantId: merchantIds.kentRidgeSports,
    productId: productIds.kentRidgeGtCut3,
    variantKey: "size=US 10;color=Black",
    quantityAvailable: 4,
    quantityReserved: 0,
    availability: InventoryAvailability.LOW_STOCK,
  },
  {
    id: "b3333333-3333-4333-8333-333333333333",
    merchantId: merchantIds.digitalLearningLab,
    productId: productIds.analyticsStarterKit,
    variantKey: "license=individual",
    quantityAvailable: 1000,
    quantityReserved: 0,
    availability: InventoryAvailability.IN_STOCK,
  },
  {
    id: "b4444444-4444-4444-8444-444444444444",
    merchantId: merchantIds.careerStudio,
    productId: productIds.careerCoaching,
    variantKey: "mode=hybrid;duration=60",
    quantityAvailable: 8,
    quantityReserved: 0,
    availability: InventoryAvailability.IN_STOCK,
  },
  {
    id: "b5555555-5555-4555-8555-555555555555",
    merchantId: merchantIds.lionCityExperiences,
    productId: productIds.sentosaKayaking,
    variantKey: "date=2026-09-05;time=17:30",
    quantityAvailable: 12,
    quantityReserved: 0,
    availability: InventoryAvailability.IN_STOCK,
  },
] satisfies Prisma.InventoryCreateManyInput[];

const pricingPolicies = [
  {
    id: "c1111111-1111-4111-8111-111111111111",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    negotiationEnabled: true,
    minimumPrice: 190,
    maxDiscountPercent: 15.38,
    inventoryDiscountEnabled: true,
    rules: {
      strategy: "inventory_aware",
      healthyStockDiscountPercent: 10,
      lowStockDiscountPercent: 0,
    },
  },
  {
    id: "c2222222-2222-4222-8222-222222222222",
    merchantId: merchantIds.kentRidgeSports,
    productId: productIds.kentRidgeGtCut3,
    negotiationEnabled: true,
    minimumPrice: 165,
    maxDiscountPercent: 15.38,
    inventoryDiscountEnabled: true,
    rules: {
      strategy: "bounded_discount",
    },
  },
  {
    id: "c3333333-3333-4333-8333-333333333333",
    merchantId: merchantIds.digitalLearningLab,
    productId: productIds.analyticsStarterKit,
    negotiationEnabled: false,
    minimumPrice: null,
    maxDiscountPercent: null,
    inventoryDiscountEnabled: false,
    rules: {
      strategy: "fixed_price",
    },
  },
  {
    id: "c4444444-4444-4444-8444-444444444444",
    merchantId: merchantIds.careerStudio,
    productId: productIds.careerCoaching,
    negotiationEnabled: true,
    minimumPrice: 70,
    maxDiscountPercent: 12.5,
    inventoryDiscountEnabled: false,
    rules: {
      strategy: "bounded_discount",
    },
  },
  {
    id: "c5555555-5555-4555-8555-555555555555",
    merchantId: merchantIds.lionCityExperiences,
    productId: productIds.sentosaKayaking,
    negotiationEnabled: false,
    minimumPrice: null,
    maxDiscountPercent: null,
    inventoryDiscountEnabled: false,
    rules: {
      strategy: "fixed_price",
    },
  },
] satisfies Prisma.PricingPolicyCreateManyInput[];

async function main(): Promise<void> {
  const prisma = getPrismaClient();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      for (const merchant of merchants) {
        const { id, ...data } = merchant;
        await transaction.merchant.upsert({
          where: { id },
          create: merchant,
          update: data,
        });
      }

      for (const product of products) {
        const { id, ...data } = product;
        await transaction.product.upsert({
          where: { id },
          create: product,
          update: data,
        });
      }

      for (const details of physicalGoodDetails) {
        const { productId, ...data } = details;
        await transaction.physicalGoodDetails.upsert({
          where: { productId },
          create: details,
          update: data,
        });
      }

      for (const details of digitalProductDetails) {
        const { productId, ...data } = details;
        await transaction.digitalProductDetails.upsert({
          where: { productId },
          create: details,
          update: data,
        });
      }

      for (const details of serviceDetails) {
        const { productId, ...data } = details;
        await transaction.serviceDetails.upsert({
          where: { productId },
          create: details,
          update: data,
        });
      }

      for (const details of bookingExperienceDetails) {
        const { productId, ...data } = details;
        await transaction.bookingExperienceDetails.upsert({
          where: { productId },
          create: details,
          update: data,
        });
      }

      for (const inventoryItem of inventory) {
        const { id: _id, productId, variantKey, ...data } = inventoryItem;
        await transaction.inventory.upsert({
          where: {
            productId_variantKey: { productId, variantKey },
          },
          create: inventoryItem,
          update: data,
        });
      }

      for (const policy of pricingPolicies) {
        const { id: _id, productId, ...data } = policy;
        await transaction.pricingPolicy.upsert({
          where: { productId },
          create: policy,
          update: data,
        });
      }

      return {
        merchants: await transaction.merchant.count({
          where: { id: { in: merchants.map(({ id }) => id) } },
        }),
        products: await transaction.product.count({
          where: { id: { in: products.map(({ id }) => id) } },
        }),
        inventory: await transaction.inventory.count({
          where: { id: { in: inventory.map(({ id }) => id) } },
        }),
        pricingPolicies: await transaction.pricingPolicy.count({
          where: { id: { in: pricingPolicies.map(({ id }) => id) } },
        }),
      };
    });

    console.log(
      `Seeded ${result.merchants} merchants, ${result.products} products, ` +
        `${result.inventory} inventory variants, and ` +
        `${result.pricingPolicies} pricing policies.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
