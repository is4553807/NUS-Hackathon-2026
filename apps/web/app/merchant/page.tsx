import Link from "next/link";

import {
  loadCategorySchemas,
  loadMerchantDashboard,
  type CategorySchema,
  type Merchant,
  type MerchantProduct,
  type ProductVariant,
} from "@/lib/merchant-api";

import {
  AddProductButton,
  ProductManagementActions,
  VariantManagementButton,
} from "./merchant-management";

import styles from "./merchant-dashboard.module.css";

type MerchantSearchParams = Promise<{
  merchant?: string | string[];
  domain?: string | string[];
}>;

const domainLabels = {
  all: "All catalog",
  retail_goods: "Physical goods",
  services_subscriptions: "Services & digital",
  bookings: "Bookings",
} as const;

const kindLabels = {
  physical_good: "Physical good",
  digital_product: "Digital product",
  service: "Service",
  booking: "Booking",
} as const;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function currency(amount: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function categoryTone(product: MerchantProduct): string {
  if (product.commerceDomain === "bookings") return styles.toneAmber ?? "";
  if (product.productKind === "digital_product") return styles.toneViolet ?? "";
  if (product.productKind === "service") return styles.toneTeal ?? "";
  return styles.toneBlue ?? "";
}

function stockForProduct(product: MerchantProduct): number | null {
  const tracked = product.variants
    .map((variant) => variant.quantityRemaining)
    .filter((quantity): quantity is number => quantity !== null);

  return tracked.length === 0
    ? null
    : tracked.reduce((total, quantity) => total + quantity, 0);
}

function productHref(merchantId: string, domain: string): string {
  const query = new URLSearchParams({ merchant: merchantId });
  if (domain !== "all") query.set("domain", domain);
  return `/merchant?${query.toString()}#catalog`;
}

function MerchantSwitcher({
  merchants,
  selectedMerchant,
}: {
  merchants: Merchant[];
  selectedMerchant: Merchant;
}) {
  return (
    <details className={styles.switcher}>
      <summary>
        <span className={styles.merchantAvatar} aria-hidden="true">
          {initials(selectedMerchant.name)}
        </span>
        <span className={styles.switcherCopy}>
          <strong>{selectedMerchant.name}</strong>
          <small>Merchant workspace</small>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className={styles.switcherMenu}>
        <p>Switch merchant</p>
        {merchants.map((merchant) => (
          <Link
            className={
              merchant.merchantId === selectedMerchant.merchantId
                ? styles.selectedMerchant
                : undefined
            }
            href={`/merchant?merchant=${merchant.merchantId}`}
            key={merchant.merchantId}
          >
            <span>{initials(merchant.name)}</span>
            <strong>{merchant.name}</strong>
            {merchant.merchantId === selectedMerchant.merchantId ? (
              <small>Current</small>
            ) : null}
          </Link>
        ))}
      </div>
    </details>
  );
}

function StatCard({
  eyebrow,
  value,
  detail,
  tone,
}: {
  eyebrow: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "violet";
}) {
  return (
    <article className={styles.statCard}>
      <div className={`${styles.statIcon} ${styles[`stat${tone}`]}`}>
        <span aria-hidden="true" />
      </div>
      <p>{eyebrow}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ProductRow({
  product,
  schema,
}: {
  product: MerchantProduct;
  schema: CategorySchema | undefined;
}) {
  const stock = stockForProduct(product);
  const attributePreview = Object.entries(product.attributes).slice(0, 2);

  return (
    <tr>
      <td>
        <div className={styles.productIdentity}>
          <span className={`${styles.productTile} ${categoryTone(product)}`}>
            {initials(product.name)}
          </span>
          <span>
            <strong>{product.name}</strong>
            <small>
              {product.brand ?? "Independent"} · {product.externalId ?? "No ID"}
            </small>
          </span>
        </div>
      </td>
      <td>
        <span className={styles.categoryLabel}>{product.categoryName}</span>
        <small className={styles.secondaryLine}>
          {kindLabels[product.productKind]}
        </small>
      </td>
      <td>
        <strong>{currency(product.basePrice)}</strong>
        <small className={styles.secondaryLine}>
          {product.variants.length} variant
          {product.variants.length === 1 ? "" : "s"}
        </small>
      </td>
      <td>
        <strong>{stock === null ? "Flexible" : stock}</strong>
        <small className={styles.secondaryLine}>
          {product.availabilityModel.replaceAll("_", " ")}
        </small>
      </td>
      <td>
        <span
          className={product.active ? styles.activePill : styles.inactivePill}
        >
          <span aria-hidden="true" />
          {product.active ? "Live" : "Paused"}
        </span>
      </td>
      <td>
        <div className={styles.attributePreview}>
          {attributePreview.length > 0 ? (
            attributePreview.map(([key, value]) => (
              <span key={key}>
                {key}: {String(value)}
              </span>
            ))
          ) : (
            <span>Canonical core fields</span>
          )}
        </div>
      </td>
      <td>
        <ProductManagementActions product={product} schema={schema} />
      </td>
    </tr>
  );
}

function InventoryRow({
  product,
  variant,
  schema,
}: {
  product: MerchantProduct;
  variant: ProductVariant;
  schema: CategorySchema | undefined;
}) {
  const remaining = variant.quantityRemaining;
  const stockClass =
    remaining === null
      ? styles.stockNeutral
      : remaining <= 5
        ? styles.stockLow
        : styles.stockHealthy;
  const stockText =
    remaining === null
      ? "Not stock-tracked"
      : remaining <= 5
        ? "Low stock"
        : "Healthy";

  return (
    <div className={styles.inventoryRow}>
      <div className={styles.inventoryProduct}>
        <span className={`${styles.miniTile} ${categoryTone(product)}`}>
          {initials(product.name)}
        </span>
        <span>
          <strong>{variant.name ?? product.name}</strong>
          <small>{variant.sku ?? "No SKU required"}</small>
        </span>
      </div>
      <div>
        <span className={`${styles.stockDot} ${stockClass}`} />
        <strong>{stockText}</strong>
      </div>
      <div>
        <strong>{remaining ?? "—"}</strong>
        <small>available</small>
      </div>
      <div>
        <strong>{variant.quantityReserved ?? "—"}</strong>
        <small>reserved</small>
      </div>
      <div className={styles.variantAttributes}>
        {Object.entries(variant.attributes)
          .slice(0, 3)
          .map(([key, value]) => (
            <span key={key}>{`${key}: ${String(value)}`}</span>
          ))}
      </div>
      <VariantManagementButton
        product={product}
        schema={schema}
        variant={variant}
      />
    </div>
  );
}

function ApiUnavailable() {
  return (
    <main className={styles.errorPage}>
      <div className={styles.errorCard}>
        <span>VC</span>
        <p>Merchant portal</p>
        <h1>The dashboard is ready, but the Commerce API is offline.</h1>
        <p>
          Start the local API and refresh this page. Your PostgreSQL catalog
          will appear automatically.
        </p>
      </div>
    </main>
  );
}

export default async function MerchantHomePage({
  searchParams,
}: {
  searchParams: MerchantSearchParams;
}) {
  const params = await searchParams;
  const requestedMerchantId = firstValue(params.merchant);
  const requestedDomain = firstValue(params.domain) ?? "all";
  const activeDomain = Object.hasOwn(domainLabels, requestedDomain)
    ? (requestedDomain as keyof typeof domainLabels)
    : "all";

  let dashboard: Awaited<ReturnType<typeof loadMerchantDashboard>>;
  let categorySchemas: CategorySchema[];
  try {
    [dashboard, categorySchemas] = await Promise.all([
      loadMerchantDashboard(requestedMerchantId),
      loadCategorySchemas(),
    ]);
  } catch {
    return <ApiUnavailable />;
  }

  const { merchants, selectedMerchant, products, profiles } = dashboard;
  if (selectedMerchant === null) return <ApiUnavailable />;

  const filteredProducts =
    activeDomain === "all"
      ? products
      : products.filter((product) => product.commerceDomain === activeDomain);
  const variants = products.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant })),
  );
  const trackedVariants = variants.filter(
    ({ variant }) => variant.quantityRemaining !== null,
  );
  const availableUnits = trackedVariants.reduce(
    (total, { variant }) => total + (variant.quantityRemaining ?? 0),
    0,
  );
  const lowStockCount = trackedVariants.filter(
    ({ variant }) => (variant.quantityRemaining ?? 0) <= 5,
  ).length;
  const liveProducts = products.filter((product) => product.active).length;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link
          className={styles.brand}
          href="/merchant"
          aria-label="Visa Commerce home"
        >
          <span>VC</span>
          <strong>Visa Commerce</strong>
        </Link>

        <nav aria-label="Merchant navigation">
          <p>Workspace</p>
          <a className={styles.activeNav} href="#overview">
            <span aria-hidden="true">01</span> Overview
          </a>
          <a href="#catalog">
            <span aria-hidden="true">02</span> Catalog
          </a>
          <a href="#inventory">
            <span aria-hidden="true">03</span> Inventory
          </a>
          <a href="#imports">
            <span aria-hidden="true">04</span> Import mappings
          </a>
        </nav>

        <div className={styles.sidebarNote}>
          <span className={styles.liveDot} aria-hidden="true" />
          <div>
            <strong>Commerce connected</strong>
            <small>API + PostgreSQL live</small>
          </div>
        </div>
        <p className={styles.prototypeLabel}>NUS Hackathon 2026 · Prototype</p>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>Merchant portal</p>
            <span className={styles.breadcrumbDivider}>/</span>
            <strong>Overview</strong>
          </div>
          <MerchantSwitcher
            merchants={merchants}
            selectedMerchant={selectedMerchant}
          />
        </header>

        <div className={styles.pageContent}>
          <section className={styles.welcome} id="overview">
            <div>
              <p className={styles.eyebrow}>Live merchant workspace</p>
              <h1>Good morning, {selectedMerchant.name}.</h1>
              <p>
                Your canonical catalog is ready for agent-led discovery and
                checkout.
              </p>
            </div>
            <div className={styles.syncStatus}>
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Catalog synchronized</strong>
                <small>Updated {dateLabel(selectedMerchant.updatedAt)}</small>
              </div>
            </div>
          </section>

          <section className={styles.stats} aria-label="Catalog summary">
            <StatCard
              eyebrow="Catalog products"
              value={String(products.length)}
              detail={`${liveProducts} visible to the agent`}
              tone="blue"
            />
            <StatCard
              eyebrow="Active variants"
              value={String(
                variants.filter(({ variant }) => variant.active).length,
              )}
              detail="Across every product type"
              tone="violet"
            />
            <StatCard
              eyebrow="Available units"
              value={
                trackedVariants.length === 0
                  ? "Flexible"
                  : String(availableUnits)
              }
              detail={
                lowStockCount === 0
                  ? "All tracked stock is healthy"
                  : `${lowStockCount} variant${lowStockCount === 1 ? "" : "s"} need attention`
              }
              tone={lowStockCount === 0 ? "green" : "amber"}
            />
            <StatCard
              eyebrow="Saved CSV mappings"
              value={String(profiles.length)}
              detail="Reusable onboarding profiles"
              tone="green"
            />
          </section>

          <section className={styles.panel} id="catalog">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.sectionLabel}>Canonical catalog</p>
                <h2>Products</h2>
                <p>
                  Every merchant format is normalized before the agent sees it.
                </p>
              </div>
              <div className={styles.headingActions}>
                <span className={styles.countBadge}>
                  {filteredProducts.length} shown
                </span>
                <AddProductButton
                  merchantId={selectedMerchant.merchantId}
                  schemas={categorySchemas}
                />
              </div>
            </div>

            <div className={styles.filterRow} aria-label="Filter products">
              {(Object.keys(domainLabels) as (keyof typeof domainLabels)[]).map(
                (domain) => (
                  <Link
                    className={
                      domain === activeDomain ? styles.activeFilter : undefined
                    }
                    href={productHref(selectedMerchant.merchantId, domain)}
                    key={domain}
                  >
                    {domainLabels[domain]}
                  </Link>
                ),
              )}
            </div>

            {filteredProducts.length > 0 ? (
              <div className={styles.tableScroller}>
                <table className={styles.productTable}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Availability</th>
                      <th>Status</th>
                      <th>Canonical attributes</th>
                      <th>Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <ProductRow
                        key={product.productId}
                        product={product}
                        schema={categorySchemas.find(
                          (schema) => schema.categoryId === product.categoryId,
                        )}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span>0</span>
                <h3>No products in this category yet</h3>
                <p>Choose another catalog filter or switch merchants.</p>
              </div>
            )}
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.panel} id="inventory">
              <div className={styles.panelHeading}>
                <div>
                  <p className={styles.sectionLabel}>Variant-level view</p>
                  <h2>Inventory health</h2>
                </div>
                <span className={styles.countBadge}>
                  {variants.length} variants
                </span>
              </div>
              <div className={styles.inventoryList}>
                {variants.length > 0 ? (
                  variants.map(({ product, variant }) => (
                    <InventoryRow
                      key={variant.variantId}
                      product={product}
                      schema={categorySchemas.find(
                        (schema) => schema.categoryId === product.categoryId,
                      )}
                      variant={variant}
                    />
                  ))
                ) : (
                  <div className={styles.compactEmpty}>
                    No variants to display.
                  </div>
                )}
              </div>
            </section>

            <section className={styles.panel} id="imports">
              <div className={styles.panelHeading}>
                <div>
                  <p className={styles.sectionLabel}>
                    Plug-and-play onboarding
                  </p>
                  <h2>CSV mappings</h2>
                </div>
                <span className={styles.schemaBadge}>Schema aware</span>
              </div>

              {profiles.length > 0 ? (
                <div className={styles.profileList}>
                  {profiles.map((profile) => (
                    <article
                      className={styles.profileCard}
                      key={profile.importProfileId}
                    >
                      <div className={styles.profileHeader}>
                        <span>CSV</span>
                        <div>
                          <strong>{profile.name}</strong>
                          <small>
                            {profile.categoryId} · v{profile.schemaVersion}
                          </small>
                        </div>
                        <span className={styles.activePill}>Active</span>
                      </div>
                      <div className={styles.mappingList}>
                        {Object.entries(profile.columnMapping)
                          .slice(0, 5)
                          .map(([source, target]) => (
                            <div key={source}>
                              <code>{source}</code>
                              <span aria-hidden="true">→</span>
                              <code>{target}</code>
                            </div>
                          ))}
                      </div>
                      <p>
                        {profile.sourceHeaders.length} source columns saved for
                        repeat imports.
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.importEmpty}>
                  <span>CSV</span>
                  <h3>No mapping profile yet</h3>
                  <p>
                    This merchant can map its own column names to the canonical
                    catalog when the first CSV is uploaded.
                  </p>
                </div>
              )}
            </section>
          </div>

          <footer className={styles.footer}>
            <span>Visa Commerce merchant prototype</span>
            <span>Live data from PostgreSQL through the Commerce API</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
