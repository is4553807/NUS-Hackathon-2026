import { apiBaseUrl } from "./api-client";

export type Merchant = {
  merchantId: string;
  name: string;
  category: string | null;
  description: string | null;
  currency: "SGD";
  contactEmail: string | null;
  status: "active" | "inactive" | "suspended";
  createdAt: string;
  updatedAt: string;
};

export type ProductVariant = {
  variantId: string;
  externalId: string | null;
  sku: string | null;
  name: string | null;
  attributes: Record<string, string | number | boolean>;
  listedPrice: number;
  imageUrl: string | null;
  active: boolean;
  quantityAvailable: number | null;
  quantityReserved: number | null;
  quantityRemaining: number | null;
};

export type MerchantProduct = {
  productId: string;
  merchantId: string;
  merchantName: string;
  externalId: string | null;
  name: string;
  description: string | null;
  commerceDomain: "retail_goods" | "services_subscriptions" | "bookings";
  categoryId: string;
  categoryName: string;
  productKind: "physical_good" | "digital_product" | "service" | "booking";
  billingModel: "one_time" | "recurring" | "usage_based" | "deposit";
  availabilityModel: "stock" | "unlimited" | "time_slot" | "capacity" | "seat";
  brand: string | null;
  basePrice: number;
  currency: "SGD";
  imageUrl: string | null;
  attributes: Record<string, string | number | boolean>;
  active: boolean;
  details: Record<string, unknown> | null;
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
};

export type ImportProfile = {
  importProfileId: string;
  merchantId: string;
  categoryId: string;
  name: string;
  schemaVersion: string;
  sourceHeaders: string[];
  columnMapping: Record<string, string>;
  normalizationRules: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogImportPreview = {
  categoryId: string;
  categoryName: string;
  schemaVersion: string;
  rowCount: number;
  headers: string[];
  columnMapping: Record<string, string>;
  targets: Array<{ target: string; label: string; required: boolean }>;
  unmappedHeaders: string[];
  missingRequiredTargets: string[];
  canImport: boolean;
  sampleRows: Array<Record<string, string>>;
};

export type CatalogImportResult = {
  products: MerchantProduct[];
  importedProductCount: number;
  importedVariantCount: number;
  importProfile: ImportProfile;
};

export type Category = {
  categoryId: string;
  parentId: string | null;
  commerceDomain: MerchantProduct["commerceDomain"];
  productKind: MerchantProduct["productKind"];
  slug: string;
  name: string;
  level: number;
  aliases: string[];
  active: boolean;
};

export type CategoryAttributeDefinition = {
  type: "string" | "number" | "boolean";
  scope: "product" | "variant";
  required?: boolean;
  comparable?: boolean;
  filterable?: boolean;
  aliases?: string[];
};

export type CategorySchema = Category & {
  schemaVersion: string;
  attributeSchema: {
    attributes: Record<string, CategoryAttributeDefinition>;
  };
};

export type PricingPolicy = {
  pricingPolicyId: string;
  merchantId: string;
  productId: string;
  negotiationEnabled: boolean;
  minimumPrice: number | null;
  maxDiscountPercent: number | null;
  inventoryDiscountEnabled: boolean;
  rules: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type ApiEnvelope<T> = {
  success: true;
  data: T;
};

async function getApiData<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Commerce API returned ${response.status} for ${path}`);
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!envelope.success) {
    throw new Error(`Commerce API returned an invalid response for ${path}`);
  }

  return envelope.data;
}

export async function loadCategorySchemas(): Promise<CategorySchema[]> {
  const { categories } = await getApiData<{ categories: Category[] }>(
    "/v1/categories",
  );
  const parentIds = new Set(
    categories
      .map((category) => category.parentId)
      .filter((parentId): parentId is string => parentId !== null),
  );
  const leafCategories = categories.filter(
    (category) => !parentIds.has(category.categoryId),
  );
  const schemas = await Promise.all(
    leafCategories.map(async (category) => {
      try {
        return await getApiData<CategorySchema>(
          `/v1/categories/${encodeURIComponent(category.categoryId)}/schema`,
        );
      } catch {
        return null;
      }
    }),
  );
  return schemas.filter((schema): schema is CategorySchema => schema !== null);
}

export async function loadMerchantDashboard(requestedMerchantId?: string) {
  const { merchants } = await getApiData<{ merchants: Merchant[] }>(
    "/v1/merchants",
  );

  const preferredMerchant = merchants.find(
    (merchant) => merchant.name === "Orchard Tech",
  );
  const selectedMerchant =
    merchants.find((merchant) => merchant.merchantId === requestedMerchantId) ??
    preferredMerchant ??
    merchants[0] ??
    null;

  if (selectedMerchant === null) {
    return { merchants, selectedMerchant, products: [], profiles: [] };
  }

  const merchantPath = encodeURIComponent(selectedMerchant.merchantId);
  const [{ products }, { profiles }] = await Promise.all([
    getApiData<{ products: MerchantProduct[] }>(
      `/v1/merchants/${merchantPath}/products`,
    ),
    getApiData<{ profiles: ImportProfile[] }>(
      `/v1/merchants/${merchantPath}/import-profiles`,
    ),
  ]);

  return { merchants, selectedMerchant, products, profiles };
}
