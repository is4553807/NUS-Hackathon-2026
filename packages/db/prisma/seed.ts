import { getPrismaClient } from "../src/client.js";
import {
  AvailabilityModel,
  BillingModel,
  CommerceDomain,
  DigitalDeliveryMethod,
  InventoryAvailability,
  MerchantStatus,
  ProductKind,
  ServiceDeliveryMode,
} from "../src/generated/prisma/enums.js";
import type { Prisma } from "../src/generated/prisma/client.js";

const categoryIds = {
  retail: "retail_goods",
  apparel: "retail_goods.apparel",
  shoes: "retail_goods.apparel.shoes",
  electronics: "retail_goods.electronics",
  smartphones: "retail_goods.electronics.smartphones",
  booksMedia: "retail_goods.books_media",
  books: "retail_goods.books_media.books",
  foodBeverage: "retail_goods.food_beverage",
  restaurantMeals: "retail_goods.food_beverage.restaurant_meals",
  services: "services_subscriptions",
  digitalProducts: "services_subscriptions.digital_products",
  software: "services_subscriptions.software",
  saas: "services_subscriptions.software.saas",
  memberships: "services_subscriptions.memberships",
  professionalServices: "services_subscriptions.professional_services",
  bookings: "bookings",
  transportation: "bookings.transportation",
  flights: "bookings.transportation.flights",
  accommodation: "bookings.accommodation",
  hotels: "bookings.accommodation.hotels",
  activities: "bookings.activities",
} as const;

type CategorySeed = readonly [
  id: string,
  parentId: string | null,
  domain: CommerceDomain,
  kind: ProductKind,
  name: string,
  aliases: string[],
  billing: BillingModel,
  availability: AvailabilityModel,
];

const categorySeeds: CategorySeed[] = [
  [
    categoryIds.retail,
    null,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Retail Goods",
    ["physical goods", "online shopping"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.apparel,
    categoryIds.retail,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Apparel",
    ["clothing"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.shoes,
    categoryIds.apparel,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Shoes",
    ["footwear", "sneakers"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.electronics,
    categoryIds.retail,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Electronics",
    ["consumer electronics"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.smartphones,
    categoryIds.electronics,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Smartphones",
    ["mobile phones", "phones"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.booksMedia,
    categoryIds.retail,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Books & Media",
    ["media"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.books,
    categoryIds.booksMedia,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Books",
    ["printed books"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.foodBeverage,
    categoryIds.retail,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Food & Beverage",
    ["food", "meals"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.restaurantMeals,
    categoryIds.foodBeverage,
    CommerceDomain.RETAIL_GOODS,
    ProductKind.PHYSICAL_GOOD,
    "Restaurant Meals",
    ["food delivery", "prepared food"],
    BillingModel.ONE_TIME,
    AvailabilityModel.STOCK,
  ],
  [
    categoryIds.services,
    null,
    CommerceDomain.SERVICES_SUBSCRIPTIONS,
    ProductKind.SERVICE,
    "Services & Subscriptions",
    ["memberships", "subscriptions"],
    BillingModel.ONE_TIME,
    AvailabilityModel.UNLIMITED,
  ],
  [
    categoryIds.digitalProducts,
    categoryIds.services,
    CommerceDomain.SERVICES_SUBSCRIPTIONS,
    ProductKind.DIGITAL_PRODUCT,
    "Digital Products",
    ["downloads", "digital goods"],
    BillingModel.ONE_TIME,
    AvailabilityModel.UNLIMITED,
  ],
  [
    categoryIds.software,
    categoryIds.services,
    CommerceDomain.SERVICES_SUBSCRIPTIONS,
    ProductKind.DIGITAL_PRODUCT,
    "Software",
    ["applications"],
    BillingModel.RECURRING,
    AvailabilityModel.UNLIMITED,
  ],
  [
    categoryIds.saas,
    categoryIds.software,
    CommerceDomain.SERVICES_SUBSCRIPTIONS,
    ProductKind.DIGITAL_PRODUCT,
    "SaaS",
    ["software subscriptions"],
    BillingModel.RECURRING,
    AvailabilityModel.UNLIMITED,
  ],
  [
    categoryIds.memberships,
    categoryIds.services,
    CommerceDomain.SERVICES_SUBSCRIPTIONS,
    ProductKind.SERVICE,
    "Memberships",
    ["plans"],
    BillingModel.RECURRING,
    AvailabilityModel.UNLIMITED,
  ],
  [
    categoryIds.professionalServices,
    categoryIds.services,
    CommerceDomain.SERVICES_SUBSCRIPTIONS,
    ProductKind.SERVICE,
    "Professional Services",
    ["consulting", "coaching"],
    BillingModel.ONE_TIME,
    AvailabilityModel.TIME_SLOT,
  ],
  [
    categoryIds.bookings,
    null,
    CommerceDomain.BOOKINGS,
    ProductKind.BOOKING,
    "Bookings",
    ["travel", "reservations"],
    BillingModel.ONE_TIME,
    AvailabilityModel.CAPACITY,
  ],
  [
    categoryIds.transportation,
    categoryIds.bookings,
    CommerceDomain.BOOKINGS,
    ProductKind.BOOKING,
    "Transportation",
    ["transport"],
    BillingModel.ONE_TIME,
    AvailabilityModel.SEAT,
  ],
  [
    categoryIds.flights,
    categoryIds.transportation,
    CommerceDomain.BOOKINGS,
    ProductKind.BOOKING,
    "Flights",
    ["airline tickets", "air travel"],
    BillingModel.ONE_TIME,
    AvailabilityModel.SEAT,
  ],
  [
    categoryIds.accommodation,
    categoryIds.bookings,
    CommerceDomain.BOOKINGS,
    ProductKind.BOOKING,
    "Accommodation",
    ["lodging"],
    BillingModel.ONE_TIME,
    AvailabilityModel.CAPACITY,
  ],
  [
    categoryIds.hotels,
    categoryIds.accommodation,
    CommerceDomain.BOOKINGS,
    ProductKind.BOOKING,
    "Hotels",
    ["hotel accommodation"],
    BillingModel.ONE_TIME,
    AvailabilityModel.CAPACITY,
  ],
  [
    categoryIds.activities,
    categoryIds.bookings,
    CommerceDomain.BOOKINGS,
    ProductKind.BOOKING,
    "Activities",
    ["experiences", "tours"],
    BillingModel.ONE_TIME,
    AvailabilityModel.CAPACITY,
  ],
];

const categories: Prisma.CategoryCreateManyInput[] = categorySeeds.map(
  ([
    id,
    parentId,
    domain,
    productKind,
    name,
    aliases,
    defaultBillingModel,
    defaultAvailabilityModel,
  ]) => ({
    id,
    parentId,
    domain,
    productKind,
    slug: id.split(".").at(-1) ?? id,
    name,
    level: id.split(".").length - 1,
    aliases,
    defaultBillingModel,
    defaultAvailabilityModel,
  }),
);

type AttributeDefinition = {
  type: "string" | "number" | "boolean";
  scope: "product" | "variant";
  required?: boolean;
  filterable?: boolean;
  comparable?: boolean;
  aliases?: string[];
};

const field = (
  type: AttributeDefinition["type"],
  scope: AttributeDefinition["scope"],
  options: Omit<AttributeDefinition, "type" | "scope"> = {},
): AttributeDefinition => ({ type, scope, ...options });

const categorySchemas: Prisma.CategorySchemaCreateManyInput[] = [
  {
    id: "d1111111-1111-4111-8111-111111111111",
    categoryId: categoryIds.shoes,
    version: "1.0",
    attributeSchema: {
      attributes: {
        productType: field("string", "product", {
          required: true,
          filterable: true,
          aliases: ["product_type", "shoe_type"],
        }),
        sport: field("string", "product", { filterable: true }),
        material: field("string", "product", { filterable: true }),
        size: field("string", "variant", {
          required: true,
          filterable: true,
          comparable: true,
          aliases: ["shoe_size", "size_name"],
        }),
        color: field("string", "variant", {
          required: true,
          filterable: true,
          aliases: ["colour", "color_name"],
        }),
      },
    },
  },
  {
    id: "d2222222-2222-4222-8222-222222222222",
    categoryId: categoryIds.smartphones,
    version: "1.0",
    attributeSchema: {
      attributes: {
        productType: field("string", "product", {
          required: true,
          filterable: true,
        }),
        model: field("string", "product", { required: true, filterable: true }),
        operatingSystem: field("string", "product", {
          filterable: true,
          aliases: ["os"],
        }),
        storage: field("string", "variant", {
          required: true,
          filterable: true,
          comparable: true,
          aliases: ["capacity", "storage_size"],
        }),
        color: field("string", "variant", {
          required: true,
          filterable: true,
          aliases: ["colour", "color_name"],
        }),
      },
    },
  },
  {
    id: "d3333333-3333-4333-8333-333333333333",
    categoryId: categoryIds.digitalProducts,
    version: "1.0",
    attributeSchema: {
      attributes: {
        productType: field("string", "product", {
          required: true,
          filterable: true,
        }),
        language: field("string", "product", { filterable: true }),
        level: field("string", "product", { filterable: true }),
        license: field("string", "variant", {
          required: true,
          filterable: true,
        }),
      },
    },
  },
  {
    id: "d4444444-4444-4444-8444-444444444444",
    categoryId: categoryIds.professionalServices,
    version: "1.0",
    attributeSchema: {
      attributes: {
        serviceType: field("string", "product", {
          required: true,
          filterable: true,
        }),
        language: field("string", "product", { filterable: true }),
        mode: field("string", "variant", { required: true, filterable: true }),
        durationMinutes: field("number", "variant", {
          required: true,
          comparable: true,
          aliases: ["duration", "duration_minutes"],
        }),
      },
    },
  },
  {
    id: "d5555555-5555-4555-8555-555555555555",
    categoryId: categoryIds.activities,
    version: "1.0",
    attributeSchema: {
      attributes: {
        experienceType: field("string", "product", {
          required: true,
          filterable: true,
        }),
        destination: field("string", "product", {
          required: true,
          filterable: true,
        }),
        difficulty: field("string", "product", { filterable: true }),
        date: field("string", "variant", { required: true, filterable: true }),
        time: field("string", "variant", { required: true }),
      },
    },
  },
  {
    id: "d6666666-6666-4666-8666-666666666666",
    categoryId: categoryIds.restaurantMeals,
    version: "1.0",
    attributeSchema: {
      attributes: {
        cuisine: field("string", "product", {
          required: true,
          filterable: true,
        }),
        dietary: field("string", "product", { filterable: true }),
        portion: field("string", "variant", { filterable: true }),
        spiceLevel: field("string", "variant", {
          filterable: true,
          aliases: ["spice_level"],
        }),
      },
    },
  },
  {
    id: "d7777777-7777-4777-8777-777777777777",
    categoryId: categoryIds.saas,
    version: "1.0",
    attributeSchema: {
      attributes: {
        softwareType: field("string", "product", {
          required: true,
          filterable: true,
        }),
        billingInterval: field("string", "variant", {
          required: true,
          filterable: true,
          aliases: ["billing_cycle"],
        }),
        seats: field("number", "variant", { required: true, comparable: true }),
      },
    },
  },
];

const merchantIds = {
  sneakerHub: "11111111-1111-4111-8111-111111111111",
  kentRidgeSports: "22222222-2222-4222-8222-222222222222",
  digitalLearningLab: "33333333-3333-4333-8333-333333333333",
  careerStudio: "44444444-4444-4444-8444-444444444444",
  lionCityExperiences: "55555555-5555-4555-8555-555555555555",
  orchardTech: "66666666-6666-4666-8666-666666666666",
} as const;

const productIds = {
  sneakerHubGtCut3: "a1111111-1111-4111-8111-111111111111",
  kentRidgeGtCut3: "a2222222-2222-4222-8222-222222222222",
  analyticsStarterKit: "a3333333-3333-4333-8333-333333333333",
  careerCoaching: "a4444444-4444-4444-8444-444444444444",
  sentosaKayaking: "a5555555-5555-4555-8555-555555555555",
  iphone16Pro: "a6666666-6666-4666-8666-666666666666",
} as const;

const merchants: Prisma.MerchantCreateManyInput[] = [
  {
    id: merchantIds.sneakerHub,
    name: "NUS Sneaker Hub",
    category: categoryIds.shoes,
    description: "Basketball footwear with same-day campus delivery.",
    currency: "SGD",
    contactEmail: "sneakers@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.kentRidgeSports,
    name: "Kent Ridge Sports",
    category: categoryIds.shoes,
    description: "Campus sports equipment and footwear retailer.",
    currency: "SGD",
    contactEmail: "sports@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.digitalLearningLab,
    name: "NUS Digital Learning Lab",
    category: categoryIds.digitalProducts,
    description: "Downloadable learning resources for university students.",
    currency: "SGD",
    contactEmail: "digital@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.careerStudio,
    name: "Campus Career Studio",
    category: categoryIds.professionalServices,
    description: "Remote and in-person career development services.",
    currency: "SGD",
    contactEmail: "career@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.lionCityExperiences,
    name: "Lion City Experiences",
    category: categoryIds.activities,
    description: "Small-group activities and experiences around Singapore.",
    currency: "SGD",
    contactEmail: "experiences@example.com",
    status: MerchantStatus.ACTIVE,
  },
  {
    id: merchantIds.orchardTech,
    name: "Orchard Tech",
    category: categoryIds.smartphones,
    description: "Consumer electronics with island-wide delivery.",
    currency: "SGD",
    contactEmail: "catalog@example.com",
    status: MerchantStatus.ACTIVE,
  },
];

const products: Prisma.ProductCreateManyInput[] = [
  {
    id: productIds.sneakerHubGtCut3,
    merchantId: merchantIds.sneakerHub,
    externalId: "NSH-GTC3",
    categoryId: categoryIds.shoes,
    productKind: ProductKind.PHYSICAL_GOOD,
    billingModel: BillingModel.ONE_TIME,
    availabilityModel: AvailabilityModel.STOCK,
    name: "Nike GT Cut 3",
    description: "Responsive basketball shoes for fast court movement.",
    brand: "Nike",
    basePrice: 195,
    currency: "SGD",
    imageUrl: null,
    attributes: {
      productType: "basketball_shoes",
      sport: "basketball",
      material: "Mesh and synthetic overlays",
      deliveryZone: "NUS campus",
    },
    active: true,
  },
  {
    id: productIds.kentRidgeGtCut3,
    merchantId: merchantIds.kentRidgeSports,
    externalId: "KRS-GTC3",
    categoryId: categoryIds.shoes,
    productKind: ProductKind.PHYSICAL_GOOD,
    billingModel: BillingModel.ONE_TIME,
    availabilityModel: AvailabilityModel.STOCK,
    name: "Nike GT Cut 3",
    description: "Basketball shoes available for campus pickup.",
    brand: "Nike",
    basePrice: 195,
    currency: "SGD",
    imageUrl: null,
    attributes: {
      productType: "basketball_shoes",
      sport: "basketball",
      material: "Mesh and synthetic overlays",
      fulfilment: "campus_pickup",
    },
    active: true,
  },
  {
    id: productIds.analyticsStarterKit,
    merchantId: merchantIds.digitalLearningLab,
    externalId: "DLL-ANALYTICS-STARTER",
    categoryId: categoryIds.digitalProducts,
    productKind: ProductKind.DIGITAL_PRODUCT,
    billingModel: BillingModel.ONE_TIME,
    availabilityModel: AvailabilityModel.UNLIMITED,
    name: "Data Analytics Starter Kit",
    description: "Downloadable templates, exercises, and reference notes.",
    brand: "NUS Digital Learning Lab",
    basePrice: 39,
    currency: "SGD",
    imageUrl: null,
    attributes: {
      productType: "learning_bundle",
      language: "English",
      level: "beginner",
    },
    active: true,
  },
  {
    id: productIds.careerCoaching,
    merchantId: merchantIds.careerStudio,
    externalId: "CCS-CAREER-60",
    categoryId: categoryIds.professionalServices,
    productKind: ProductKind.SERVICE,
    billingModel: BillingModel.ONE_TIME,
    availabilityModel: AvailabilityModel.TIME_SLOT,
    name: "60-Minute Career Coaching",
    description: "One-to-one CV review and interview preparation session.",
    brand: "Campus Career Studio",
    basePrice: 80,
    currency: "SGD",
    imageUrl: null,
    attributes: { serviceType: "career_coaching", language: "English" },
    active: true,
  },
  {
    id: productIds.sentosaKayaking,
    merchantId: merchantIds.lionCityExperiences,
    externalId: "LCE-SENTOSA-KAYAK",
    categoryId: categoryIds.activities,
    productKind: ProductKind.BOOKING,
    billingModel: BillingModel.ONE_TIME,
    availabilityModel: AvailabilityModel.CAPACITY,
    name: "Sentosa Sunset Kayaking",
    description: "Guided small-group sunset kayaking experience.",
    brand: "Lion City Experiences",
    basePrice: 95,
    currency: "SGD",
    imageUrl: null,
    attributes: {
      experienceType: "outdoor_activity",
      destination: "Sentosa, Singapore",
      difficulty: "beginner",
      equipmentIncluded: true,
      minimumAge: 12,
    },
    active: true,
  },
  {
    id: productIds.iphone16Pro,
    merchantId: merchantIds.orchardTech,
    externalId: "OT-IP16P",
    categoryId: categoryIds.smartphones,
    productKind: ProductKind.PHYSICAL_GOOD,
    billingModel: BillingModel.ONE_TIME,
    availabilityModel: AvailabilityModel.STOCK,
    name: "iPhone 16 Pro",
    description: "Apple smartphone in multiple storage and colour variants.",
    brand: "Apple",
    basePrice: 1599,
    currency: "SGD",
    imageUrl: null,
    attributes: {
      productType: "smartphone",
      model: "iPhone 16 Pro",
      operatingSystem: "iOS",
    },
    active: true,
  },
];

const physicalGoodDetails: Prisma.PhysicalGoodDetailsCreateManyInput[] = [
  {
    productId: productIds.sneakerHubGtCut3,
    weightGrams: 390,
    lengthCm: 32,
    widthCm: 21,
    heightCm: 12,
    shippingRequired: true,
  },
  {
    productId: productIds.kentRidgeGtCut3,
    weightGrams: 390,
    lengthCm: 32,
    widthCm: 21,
    heightCm: 12,
    shippingRequired: false,
  },
  {
    productId: productIds.iphone16Pro,
    weightGrams: 199,
    lengthCm: 14.96,
    widthCm: 7.15,
    heightCm: 0.83,
    shippingRequired: true,
  },
];

const digitalProductDetails: Prisma.DigitalProductDetailsCreateManyInput[] = [
  {
    productId: productIds.analyticsStarterKit,
    deliveryMethod: DigitalDeliveryMethod.DOWNLOAD,
    fileFormat: "ZIP/PDF/XLSX",
    fileSizeBytes: 52_428_800n,
    version: "2026.1",
    licenseRequired: true,
    accessDurationDays: 365,
    fulfillmentUrl: "https://example.com/demo/data-analytics-starter-kit",
  },
];

const serviceDetails: Prisma.ServiceDetailsCreateManyInput[] = [
  {
    productId: productIds.careerCoaching,
    serviceType: "career_coaching",
    deliveryMode: ServiceDeliveryMode.HYBRID,
    durationMinutes: 60,
    location: "NUS Central Library or remote video call",
    serviceAreas: ["NUS Kent Ridge", "Remote"],
    providerName: "Campus Career Studio Coach",
    bookingRequired: true,
  },
];

const bookingExperienceDetails: Prisma.BookingExperienceDetailsCreateManyInput[] =
  [
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
    },
  ];

const variants: Prisma.ProductVariantCreateManyInput[] = [
  {
    id: "b1111111-1111-4111-8111-111111111111",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    externalId: "NSH-GTC3-US8-BLK",
    sku: "NSH-GTC3-US8-BLK",
    name: "US 8 / Black",
    attributes: { size: "US 8", color: "Black" },
    listedPrice: 195,
    active: true,
  },
  {
    id: "b1111111-1111-4111-8111-111111111112",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    externalId: "NSH-GTC3-US9-BLK",
    sku: "NSH-GTC3-US9-BLK",
    name: "US 9 / Black",
    attributes: { size: "US 9", color: "Black" },
    listedPrice: 195,
    active: true,
  },
  {
    id: "b1111111-1111-4111-8111-111111111113",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    externalId: "NSH-GTC3-US10-BLK",
    sku: "NSH-GTC3-US10-BLK",
    name: "US 10 / Black",
    attributes: { size: "US 10", color: "Black" },
    listedPrice: 195,
    active: true,
  },
  {
    id: "b2222222-2222-4222-8222-222222222221",
    merchantId: merchantIds.kentRidgeSports,
    productId: productIds.kentRidgeGtCut3,
    externalId: "KRS-GTC3-US9-BLK",
    sku: "KRS-GTC3-US9-BLK",
    name: "US 9 / Black",
    attributes: { size: "US 9", color: "Black" },
    listedPrice: 195,
    active: true,
  },
  {
    id: "b2222222-2222-4222-8222-222222222222",
    merchantId: merchantIds.kentRidgeSports,
    productId: productIds.kentRidgeGtCut3,
    externalId: "KRS-GTC3-US10-BLK",
    sku: "KRS-GTC3-US10-BLK",
    name: "US 10 / Black",
    attributes: { size: "US 10", color: "Black" },
    listedPrice: 195,
    active: true,
  },
  {
    id: "b3333333-3333-4333-8333-333333333333",
    merchantId: merchantIds.digitalLearningLab,
    productId: productIds.analyticsStarterKit,
    externalId: "DLL-ANALYTICS-INDIVIDUAL",
    sku: "DLL-ANALYTICS-INDIVIDUAL",
    name: "Individual licence",
    attributes: { license: "individual" },
    listedPrice: 39,
    active: true,
  },
  {
    id: "b4444444-4444-4444-8444-444444444444",
    merchantId: merchantIds.careerStudio,
    productId: productIds.careerCoaching,
    externalId: "CCS-CAREER-HYBRID-60",
    sku: "CCS-CAREER-HYBRID-60",
    name: "Hybrid / 60 minutes",
    attributes: { mode: "hybrid", durationMinutes: 60 },
    listedPrice: 80,
    active: true,
  },
  {
    id: "b5555555-5555-4555-8555-555555555555",
    merchantId: merchantIds.lionCityExperiences,
    productId: productIds.sentosaKayaking,
    externalId: "LCE-KAYAK-20260905-1730",
    sku: "LCE-KAYAK-20260905-1730",
    name: "5 Sep 2026 / 17:30",
    attributes: { date: "2026-09-05", time: "17:30" },
    listedPrice: 95,
    active: true,
  },
  {
    id: "b6666666-6666-4666-8666-666666666661",
    merchantId: merchantIds.orchardTech,
    productId: productIds.iphone16Pro,
    externalId: "OT-IP16P-128-BLK",
    sku: "OT-IP16P-128-BLK",
    name: "128GB / Black",
    attributes: { storage: "128GB", color: "Black" },
    listedPrice: 1599,
    active: true,
  },
  {
    id: "b6666666-6666-4666-8666-666666666662",
    merchantId: merchantIds.orchardTech,
    productId: productIds.iphone16Pro,
    externalId: "OT-IP16P-256-BLK",
    sku: "OT-IP16P-256-BLK",
    name: "256GB / Black",
    attributes: { storage: "256GB", color: "Black" },
    listedPrice: 1749,
    active: true,
  },
  {
    id: "b6666666-6666-4666-8666-666666666663",
    merchantId: merchantIds.orchardTech,
    productId: productIds.iphone16Pro,
    externalId: "OT-IP16P-256-WHT",
    sku: "OT-IP16P-256-WHT",
    name: "256GB / White",
    attributes: { storage: "256GB", color: "White" },
    listedPrice: 1749,
    active: true,
  },
];

const inventoryQuantities: Array<readonly [string, string, number]> = [
  ["b1111111-1111-4111-8111-111111111111", merchantIds.sneakerHub, 5],
  ["b1111111-1111-4111-8111-111111111112", merchantIds.sneakerHub, 2],
  ["b1111111-1111-4111-8111-111111111113", merchantIds.sneakerHub, 7],
  ["b2222222-2222-4222-8222-222222222221", merchantIds.kentRidgeSports, 25],
  ["b2222222-2222-4222-8222-222222222222", merchantIds.kentRidgeSports, 4],
  [
    "b3333333-3333-4333-8333-333333333333",
    merchantIds.digitalLearningLab,
    1000,
  ],
  ["b4444444-4444-4444-8444-444444444444", merchantIds.careerStudio, 8],
  ["b5555555-5555-4555-8555-555555555555", merchantIds.lionCityExperiences, 12],
  ["b6666666-6666-4666-8666-666666666661", merchantIds.orchardTech, 8],
  ["b6666666-6666-4666-8666-666666666662", merchantIds.orchardTech, 12],
  ["b6666666-6666-4666-8666-666666666663", merchantIds.orchardTech, 6],
];

const inventory: Prisma.InventoryCreateManyInput[] = inventoryQuantities.map(
  ([variantId, merchantId, quantityAvailable]) => ({
    id: variantId,
    merchantId,
    variantId,
    quantityAvailable,
    quantityReserved: 0,
    availability:
      quantityAvailable <= 5
        ? InventoryAvailability.LOW_STOCK
        : InventoryAvailability.IN_STOCK,
  }),
);

const pricingPolicies: Prisma.PricingPolicyCreateManyInput[] = [
  {
    id: "c1111111-1111-4111-8111-111111111111",
    merchantId: merchantIds.sneakerHub,
    productId: productIds.sneakerHubGtCut3,
    negotiationEnabled: true,
    minimumPrice: 190,
    maxDiscountPercent: 15.38,
    inventoryDiscountEnabled: true,
    rules: { strategy: "inventory_aware" },
  },
  {
    id: "c2222222-2222-4222-8222-222222222222",
    merchantId: merchantIds.kentRidgeSports,
    productId: productIds.kentRidgeGtCut3,
    negotiationEnabled: true,
    minimumPrice: 165,
    maxDiscountPercent: 15.38,
    inventoryDiscountEnabled: true,
    rules: { strategy: "bounded_discount" },
  },
  {
    id: "c3333333-3333-4333-8333-333333333333",
    merchantId: merchantIds.digitalLearningLab,
    productId: productIds.analyticsStarterKit,
    negotiationEnabled: false,
    minimumPrice: null,
    maxDiscountPercent: null,
    inventoryDiscountEnabled: false,
    rules: { strategy: "fixed_price" },
  },
  {
    id: "c4444444-4444-4444-8444-444444444444",
    merchantId: merchantIds.careerStudio,
    productId: productIds.careerCoaching,
    negotiationEnabled: true,
    minimumPrice: 70,
    maxDiscountPercent: 12.5,
    inventoryDiscountEnabled: false,
    rules: { strategy: "bounded_discount" },
  },
  {
    id: "c5555555-5555-4555-8555-555555555555",
    merchantId: merchantIds.lionCityExperiences,
    productId: productIds.sentosaKayaking,
    negotiationEnabled: false,
    minimumPrice: null,
    maxDiscountPercent: null,
    inventoryDiscountEnabled: false,
    rules: { strategy: "fixed_price" },
  },
  {
    id: "c6666666-6666-4666-8666-666666666666",
    merchantId: merchantIds.orchardTech,
    productId: productIds.iphone16Pro,
    negotiationEnabled: false,
    minimumPrice: null,
    maxDiscountPercent: null,
    inventoryDiscountEnabled: false,
    rules: { strategy: "fixed_price" },
  },
];

const importProfiles: Prisma.MerchantImportProfileCreateManyInput[] = [
  {
    id: "f6666666-6666-4666-8666-666666666666",
    merchantId: merchantIds.orchardTech,
    categoryId: categoryIds.smartphones,
    name: "Orchard Tech smartphone CSV",
    schemaVersion: "1.0",
    sourceHeaders: [
      "item_title",
      "unit_price_sgd",
      "item_type",
      "model_name",
      "capacity",
      "color_name",
      "stock_on_hand",
      "merchant_sku",
    ],
    columnMapping: {
      item_title: "product.name",
      unit_price_sgd: "variant.listedPrice",
      item_type: "product.attributes.productType",
      model_name: "product.attributes.model",
      capacity: "variant.attributes.storage",
      color_name: "variant.attributes.color",
      stock_on_hand: "inventory.quantityAvailable",
      merchant_sku: "variant.sku",
    },
    normalizationRules: {
      capacity: { canonicalKey: "storage", trim: true, uppercaseUnit: true },
      color_name: { canonicalKey: "color", trim: true },
    },
    active: true,
  },
];

async function main(): Promise<void> {
  const prisma = getPrismaClient();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      for (const category of categories) {
        const { id, ...data } = category;
        await transaction.category.upsert({
          where: { id },
          create: category,
          update: data,
        });
      }
      for (const schema of categorySchemas) {
        const { id: _id, categoryId, version, ...data } = schema;
        await transaction.categorySchema.upsert({
          where: { categoryId_version: { categoryId, version } },
          create: schema,
          update: data,
        });
      }
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
      for (const variant of variants) {
        const { id, ...data } = variant;
        await transaction.productVariant.upsert({
          where: { id },
          create: variant,
          update: data,
        });
      }
      for (const inventoryItem of inventory) {
        const { id: _id, variantId, ...data } = inventoryItem;
        await transaction.inventory.upsert({
          where: { variantId },
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
      for (const profile of importProfiles) {
        const { id: _id, merchantId, name, ...data } = profile;
        await transaction.merchantImportProfile.upsert({
          where: { merchantId_name: { merchantId, name } },
          create: profile,
          update: data,
        });
      }

      return {
        categories: await transaction.category.count({
          where: { id: { in: categories.map(({ id }) => id as string) } },
        }),
        merchants: await transaction.merchant.count({
          where: { id: { in: merchants.map(({ id }) => id as string) } },
        }),
        products: await transaction.product.count({
          where: { id: { in: products.map(({ id }) => id as string) } },
        }),
        variants: await transaction.productVariant.count({
          where: { id: { in: variants.map(({ id }) => id as string) } },
        }),
        inventory: await transaction.inventory.count({
          where: { id: { in: inventory.map(({ id }) => id as string) } },
        }),
      };
    });

    console.log(
      `Seeded ${result.categories} categories, ${result.merchants} merchants, ` +
        `${result.products} products, ${result.variants} variants, and ${result.inventory} inventory records.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
