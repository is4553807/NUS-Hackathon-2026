import {
  DigitalDeliveryMethod as DatabaseDigitalDeliveryMethod,
  MerchantStatus,
  Prisma,
  ProductCategory as DatabaseProductCategory,
  ServiceDeliveryMode as DatabaseServiceDeliveryMode,
} from "@visa-commerce/db";
import type { ProductCategory } from "@visa-commerce/contracts";

import { getCommerceDatabase, type CommerceDependencies } from "../database.js";
import { throwNotFound, throwValidationError } from "../errors.js";
import {
  requireDate,
  requireNonEmpty,
  requireNonNegative,
  requireNonNegativeInteger,
  requirePositiveInteger,
  roundMoney,
} from "../validation.js";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

type ProductBaseInput = {
  merchantId: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  listedPrice: number;
  currency?: "SGD";
  imageUrl?: string | null;
  active?: boolean;
};

export type PhysicalGoodDetailsInput = {
  sku?: string | null;
  sizeOptions?: string[];
  colorOptions?: string[];
  material?: string | null;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  shippingRequired?: boolean;
  metadata?: JsonObject;
};

export type DigitalProductDetailsInput = {
  deliveryMethod: "download" | "license_key" | "streaming" | "account_access";
  fileFormat?: string | null;
  fileSizeBytes?: number | null;
  version?: string | null;
  licenseRequired?: boolean;
  accessDurationDays?: number | null;
  fulfillmentUrl?: string | null;
  metadata?: JsonObject;
};

export type ServiceDetailsInput = {
  serviceType: string;
  deliveryMode: "in_person" | "remote" | "hybrid";
  durationMinutes: number;
  location?: string | null;
  serviceAreas?: string[];
  providerName?: string | null;
  bookingRequired?: boolean;
  metadata?: JsonObject;
};

export type BookingExperienceDetailsInput = {
  experienceType?: string | null;
  destination: string;
  venue?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone?: string;
  capacity: number;
  minParticipants?: number;
  meetingPoint?: string | null;
  metadata?: JsonObject;
};

export type CreateProductInput =
  | (ProductBaseInput & {
      category: "physical_goods";
      details: PhysicalGoodDetailsInput;
    })
  | (ProductBaseInput & {
      category: "digital_products";
      details: DigitalProductDetailsInput;
    })
  | (ProductBaseInput & {
      category: "services";
      details: ServiceDetailsInput;
    })
  | (ProductBaseInput & {
      category: "bookings_experiences";
      details: BookingExperienceDetailsInput;
    });

export type UpdateProductInput = {
  name?: string;
  description?: string | null;
  brand?: string | null;
  listedPrice?: number;
  imageUrl?: string | null;
  active?: boolean;
};

export type ProductRecord = {
  productId: string;
  merchantId: string;
  merchantName: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  brand: string | null;
  listedPrice: number;
  currency: "SGD";
  imageUrl: string | null;
  active: boolean;
  details: JsonObject | null;
  createdAt: string;
  updatedAt: string;
};

const categoryToDatabase: Record<ProductCategory, DatabaseProductCategory> = {
  physical_goods: DatabaseProductCategory.PHYSICAL_GOODS,
  digital_products: DatabaseProductCategory.DIGITAL_PRODUCTS,
  services: DatabaseProductCategory.SERVICES,
  bookings_experiences: DatabaseProductCategory.BOOKINGS_EXPERIENCES,
};

const categoryFromDatabase: Record<DatabaseProductCategory, ProductCategory> = {
  PHYSICAL_GOODS: "physical_goods",
  DIGITAL_PRODUCTS: "digital_products",
  SERVICES: "services",
  BOOKINGS_EXPERIENCES: "bookings_experiences",
};

const digitalDeliveryToDatabase = {
  download: DatabaseDigitalDeliveryMethod.DOWNLOAD,
  license_key: DatabaseDigitalDeliveryMethod.LICENSE_KEY,
  streaming: DatabaseDigitalDeliveryMethod.STREAMING,
  account_access: DatabaseDigitalDeliveryMethod.ACCOUNT_ACCESS,
} as const;

const digitalDeliveryFromDatabase = {
  DOWNLOAD: "download",
  LICENSE_KEY: "license_key",
  STREAMING: "streaming",
  ACCOUNT_ACCESS: "account_access",
} as const;

const serviceModeToDatabase = {
  in_person: DatabaseServiceDeliveryMode.IN_PERSON,
  remote: DatabaseServiceDeliveryMode.REMOTE,
  hybrid: DatabaseServiceDeliveryMode.HYBRID,
} as const;

const serviceModeFromDatabase = {
  IN_PERSON: "in_person",
  REMOTE: "remote",
  HYBRID: "hybrid",
} as const;

const productInclude = {
  merchant: { select: { name: true } },
  physicalGoodDetails: true,
  digitalProductDetails: true,
  serviceDetails: true,
  bookingExperienceDetails: true,
} satisfies Prisma.ProductInclude;

type ProductWithDetails = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function cleanOptions(values: string[] | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

function mapDetails(product: ProductWithDetails): JsonObject | null {
  if (
    product.category === DatabaseProductCategory.PHYSICAL_GOODS &&
    product.physicalGoodDetails !== null
  ) {
    const details = product.physicalGoodDetails;
    return {
      sku: details.sku,
      sizeOptions: details.sizeOptions,
      colorOptions: details.colorOptions,
      material: details.material,
      weightGrams: details.weightGrams,
      lengthCm: details.lengthCm?.toNumber() ?? null,
      widthCm: details.widthCm?.toNumber() ?? null,
      heightCm: details.heightCm?.toNumber() ?? null,
      shippingRequired: details.shippingRequired,
      metadata: (details.metadata as JsonValue | null) ?? null,
    };
  }

  if (
    product.category === DatabaseProductCategory.DIGITAL_PRODUCTS &&
    product.digitalProductDetails !== null
  ) {
    const details = product.digitalProductDetails;
    return {
      deliveryMethod: digitalDeliveryFromDatabase[details.deliveryMethod],
      fileFormat: details.fileFormat,
      fileSizeBytes: details.fileSizeBytes?.toString() ?? null,
      version: details.version,
      licenseRequired: details.licenseRequired,
      accessDurationDays: details.accessDurationDays,
      fulfillmentUrl: details.fulfillmentUrl,
      metadata: (details.metadata as JsonValue | null) ?? null,
    };
  }

  if (
    product.category === DatabaseProductCategory.SERVICES &&
    product.serviceDetails !== null
  ) {
    const details = product.serviceDetails;
    return {
      serviceType: details.serviceType,
      deliveryMode: serviceModeFromDatabase[details.deliveryMode],
      durationMinutes: details.durationMinutes,
      location: details.location,
      serviceAreas: details.serviceAreas,
      providerName: details.providerName,
      bookingRequired: details.bookingRequired,
      metadata: (details.metadata as JsonValue | null) ?? null,
    };
  }

  if (
    product.category === DatabaseProductCategory.BOOKINGS_EXPERIENCES &&
    product.bookingExperienceDetails !== null
  ) {
    const details = product.bookingExperienceDetails;
    return {
      experienceType: details.experienceType,
      destination: details.destination,
      venue: details.venue,
      startsAt: details.startsAt.toISOString(),
      endsAt: details.endsAt.toISOString(),
      timezone: details.timezone,
      capacity: details.capacity,
      minParticipants: details.minParticipants,
      meetingPoint: details.meetingPoint,
      metadata: (details.metadata as JsonValue | null) ?? null,
    };
  }

  return null;
}

function toProductRecord(product: ProductWithDetails): ProductRecord {
  return {
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    name: product.name,
    description: product.description,
    category: categoryFromDatabase[product.category],
    brand: product.brand,
    listedPrice: product.listedPrice.toNumber(),
    currency: "SGD",
    imageUrl: product.imageUrl,
    active: product.active,
    details: mapDetails(product),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function buildCategoryDetails(
  input: CreateProductInput,
): Pick<
  Prisma.ProductCreateInput,
  | "physicalGoodDetails"
  | "digitalProductDetails"
  | "serviceDetails"
  | "bookingExperienceDetails"
> {
  switch (input.category) {
    case "physical_goods": {
      const details = input.details;
      return {
        physicalGoodDetails: {
          create: {
            sku: optionalText(details.sku),
            sizeOptions: cleanOptions(details.sizeOptions),
            colorOptions: cleanOptions(details.colorOptions),
            material: optionalText(details.material),
            weightGrams:
              details.weightGrams === null || details.weightGrams === undefined
                ? null
                : requireNonNegativeInteger(
                    details.weightGrams,
                    "details.weightGrams",
                  ),
            lengthCm:
              details.lengthCm === null || details.lengthCm === undefined
                ? null
                : requireNonNegative(details.lengthCm, "details.lengthCm"),
            widthCm:
              details.widthCm === null || details.widthCm === undefined
                ? null
                : requireNonNegative(details.widthCm, "details.widthCm"),
            heightCm:
              details.heightCm === null || details.heightCm === undefined
                ? null
                : requireNonNegative(details.heightCm, "details.heightCm"),
            shippingRequired: details.shippingRequired ?? true,
            metadata: details.metadata as Prisma.InputJsonObject | undefined,
          },
        },
      };
    }
    case "digital_products": {
      const details = input.details;
      return {
        digitalProductDetails: {
          create: {
            deliveryMethod: digitalDeliveryToDatabase[details.deliveryMethod],
            fileFormat: optionalText(details.fileFormat),
            fileSizeBytes:
              details.fileSizeBytes === null ||
              details.fileSizeBytes === undefined
                ? null
                : BigInt(
                    requireNonNegativeInteger(
                      details.fileSizeBytes,
                      "details.fileSizeBytes",
                    ),
                  ),
            version: optionalText(details.version),
            licenseRequired: details.licenseRequired ?? false,
            accessDurationDays:
              details.accessDurationDays === null ||
              details.accessDurationDays === undefined
                ? null
                : requirePositiveInteger(
                    details.accessDurationDays,
                    "details.accessDurationDays",
                  ),
            fulfillmentUrl: optionalText(details.fulfillmentUrl),
            metadata: details.metadata as Prisma.InputJsonObject | undefined,
          },
        },
      };
    }
    case "services": {
      const details = input.details;
      return {
        serviceDetails: {
          create: {
            serviceType: requireNonEmpty(
              details.serviceType,
              "details.serviceType",
            ),
            deliveryMode: serviceModeToDatabase[details.deliveryMode],
            durationMinutes: requirePositiveInteger(
              details.durationMinutes,
              "details.durationMinutes",
            ),
            location: optionalText(details.location),
            serviceAreas: cleanOptions(details.serviceAreas),
            providerName: optionalText(details.providerName),
            bookingRequired: details.bookingRequired ?? true,
            metadata: details.metadata as Prisma.InputJsonObject | undefined,
          },
        },
      };
    }
    case "bookings_experiences": {
      const details = input.details;
      const startsAt = requireDate(details.startsAt, "details.startsAt");
      const endsAt = requireDate(details.endsAt, "details.endsAt");
      const capacity = requirePositiveInteger(
        details.capacity,
        "details.capacity",
      );
      const minParticipants = requirePositiveInteger(
        details.minParticipants ?? 1,
        "details.minParticipants",
      );

      if (endsAt <= startsAt) {
        throwValidationError("details.endsAt must be after details.startsAt.");
      }

      if (minParticipants > capacity) {
        throwValidationError(
          "details.minParticipants must not exceed details.capacity.",
        );
      }

      return {
        bookingExperienceDetails: {
          create: {
            experienceType: optionalText(details.experienceType),
            destination: requireNonEmpty(
              details.destination,
              "details.destination",
            ),
            venue: optionalText(details.venue),
            startsAt,
            endsAt,
            timezone: requireNonEmpty(
              details.timezone ?? "Asia/Singapore",
              "details.timezone",
            ),
            capacity,
            minParticipants,
            meetingPoint: optionalText(details.meetingPoint),
            metadata: details.metadata as Prisma.InputJsonObject | undefined,
          },
        },
      };
    }
  }
}

export async function createProduct(
  input: CreateProductInput,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord> {
  const database = getCommerceDatabase(dependencies);
  const merchant = await database.merchant.findUnique({
    where: { id: input.merchantId },
    select: { status: true },
  });

  if (merchant === null) {
    throwNotFound("Merchant", input.merchantId);
  }

  if (merchant.status !== MerchantStatus.ACTIVE) {
    throwValidationError(
      "Products can only be created for an active merchant.",
      {
        merchantId: input.merchantId,
      },
    );
  }

  const listedPrice = roundMoney(
    requireNonNegative(input.listedPrice, "listedPrice"),
  );

  const data: Prisma.ProductCreateInput = {
    merchant: { connect: { id: input.merchantId } },
    name: requireNonEmpty(input.name, "name"),
    description: optionalText(input.description),
    category: categoryToDatabase[input.category],
    brand: optionalText(input.brand),
    listedPrice,
    currency: input.currency ?? "SGD",
    imageUrl: optionalText(input.imageUrl),
    active: input.active ?? true,
    ...buildCategoryDetails(input),
  };

  const product = await database.product.create({
    data,
    include: productInclude,
  });

  return toProductRecord(product);
}

export async function getProduct(
  productId: string,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord> {
  const database = getCommerceDatabase(dependencies);
  const product = await database.product.findUnique({
    where: { id: productId },
    include: productInclude,
  });

  if (product === null) {
    throwNotFound("Product", productId);
  }

  return toProductRecord(product);
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord> {
  const database = getCommerceDatabase(dependencies);
  const existing = await database.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (existing === null) {
    throwNotFound("Product", productId);
  }

  const data: Prisma.ProductUpdateInput = {};

  if (input.name !== undefined) data.name = requireNonEmpty(input.name, "name");
  if (input.description !== undefined)
    data.description = optionalText(input.description);
  if (input.brand !== undefined) data.brand = optionalText(input.brand);
  if (input.imageUrl !== undefined)
    data.imageUrl = optionalText(input.imageUrl);
  if (input.active !== undefined) data.active = input.active;
  if (input.listedPrice !== undefined) {
    data.listedPrice = roundMoney(
      requireNonNegative(input.listedPrice, "listedPrice"),
    );
  }

  if (Object.keys(data).length === 0) {
    throwValidationError("At least one product field must be provided.");
  }

  const product = await database.product.update({
    where: { id: productId },
    data,
    include: productInclude,
  });

  return toProductRecord(product);
}

export async function listMerchantProducts(
  merchantId: string,
  dependencies: CommerceDependencies = {},
): Promise<ProductRecord[]> {
  const database = getCommerceDatabase(dependencies);
  const merchant = await database.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true },
  });

  if (merchant === null) {
    throwNotFound("Merchant", merchantId);
  }

  const products = await database.product.findMany({
    where: { merchantId },
    include: productInclude,
    orderBy: { createdAt: "desc" },
  });

  return products.map(toProductRecord);
}
