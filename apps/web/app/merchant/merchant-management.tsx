"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";

import type {
  CategoryAttributeDefinition,
  CategorySchema,
  MerchantProduct,
  ProductVariant,
} from "@/lib/merchant-api";

import {
  configureMerchantPricingAction,
  createMerchantProductAction,
  getMerchantPricingPolicyAction,
  updateMerchantProductAction,
  updateMerchantVariantAction,
} from "./actions";
import styles from "./merchant-dashboard.module.css";

type Scalar = string | number | boolean;
type Attributes = Record<string, Scalar>;
type Feedback = { tone: "success" | "error"; message: string } | null;

function fieldLabel(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function nullableText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length === 0 ? null : value;
}

function requiredText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalNumber(formData: FormData, name: string): number | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length === 0 ? null : Number(value);
}

function requiredNumber(formData: FormData, name: string): number {
  return Number(requiredText(formData, name));
}

function localDateToIso(formData: FormData, name: string): string {
  return new Date(requiredText(formData, name)).toISOString();
}

function definitionsFor(
  schema: CategorySchema,
  scope: CategoryAttributeDefinition["scope"],
): Array<[string, CategoryAttributeDefinition]> {
  return Object.entries(schema.attributeSchema.attributes).filter(
    ([, definition]) => definition.scope === scope,
  );
}

function readAttributes(
  formData: FormData,
  prefix: string,
  definitions: Array<[string, CategoryAttributeDefinition]>,
): Attributes {
  const attributes: Attributes = {};
  for (const [key, definition] of definitions) {
    const inputName = `${prefix}${key}`;
    if (definition.type === "boolean") {
      attributes[key] = formData.has(inputName);
      continue;
    }
    const value = requiredText(formData, inputName);
    if (value.length === 0) continue;
    attributes[key] = definition.type === "number" ? Number(value) : value;
  }
  return attributes;
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (feedback === null) return null;
  return (
    <p
      className={
        feedback.tone === "success" ? styles.formSuccess : styles.formError
      }
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}

function Modal({
  title,
  eyebrow,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="merchant-modal-title"
        aria-modal="true"
        className={`${styles.modal} ${wide ? styles.modalWide : ""}`}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <div>
            <p>{eyebrow}</p>
            <h2 id="merchant-modal-title">{title}</h2>
            <span>{description}</span>
          </div>
          <button
            aria-label="Close dialog"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className={styles.modalBody}>{children}</div>
      </section>
    </div>
  );
}

function AttributeField({
  fieldKey,
  definition,
  name,
  defaultValue,
}: {
  fieldKey: string;
  definition: CategoryAttributeDefinition;
  name: string;
  defaultValue?: Scalar;
}) {
  const label = fieldLabel(fieldKey);
  if (definition.type === "boolean") {
    return (
      <label className={styles.checkField}>
        <input
          defaultChecked={defaultValue === true}
          name={name}
          type="checkbox"
        />
        <span>
          <strong>{label}</strong>
          <small>Enable this attribute</small>
        </span>
      </label>
    );
  }

  return (
    <label className={styles.field}>
      <span>
        {label}
        {definition.required === true ? <em>Required</em> : null}
      </span>
      <input
        defaultValue={defaultValue === undefined ? "" : String(defaultValue)}
        min={definition.type === "number" ? 0 : undefined}
        name={name}
        placeholder={`Enter ${label.toLocaleLowerCase("en")}`}
        required={definition.required === true}
        step={definition.type === "number" ? "any" : undefined}
        type={definition.type === "number" ? "number" : "text"}
      />
    </label>
  );
}

function CoreProductFields({ product }: { product?: MerchantProduct }) {
  return (
    <div className={styles.formGrid}>
      <label className={styles.fieldWide}>
        <span>
          Product name <em>Required</em>
        </span>
        <input defaultValue={product?.name} name="name" required />
      </label>
      <label className={styles.field}>
        <span>Brand</span>
        <input defaultValue={product?.brand ?? ""} name="brand" />
      </label>
      <label className={styles.field}>
        <span>
          Base price (SGD) <em>Required</em>
        </span>
        <input
          defaultValue={product?.basePrice}
          min="0"
          name="basePrice"
          required
          step="0.01"
          type="number"
        />
      </label>
      <label className={styles.field}>
        <span>Image URL</span>
        <input
          defaultValue={product?.imageUrl ?? ""}
          name="imageUrl"
          type="url"
        />
      </label>
      <label className={styles.fieldWide}>
        <span>Description</span>
        <textarea
          defaultValue={product?.description ?? ""}
          name="description"
          rows={3}
        />
      </label>
      <details className={styles.advancedFields}>
        <summary>Already use your own product IDs?</summary>
        <p>
          Optional. Open this only when syncing an existing POS, ERP, or online
          store.
        </p>
        <div className={styles.advancedFieldsGrid}>
          <label className={styles.fieldWide}>
            <span>External system product ID</span>
            <input defaultValue={product?.externalId ?? ""} name="externalId" />
          </label>
        </div>
      </details>
    </div>
  );
}

function ProductDetailsFields({ schema }: { schema: CategorySchema }) {
  if (schema.productKind === "physical_good") {
    return (
      <div className={styles.formGrid}>
        <label className={styles.checkFieldWide}>
          <input
            defaultChecked
            name="details.shippingRequired"
            type="checkbox"
          />
          <span>
            <strong>Shipping required</strong>
            <small>The item needs physical fulfilment.</small>
          </span>
        </label>
        {[
          ["weightGrams", "Weight (grams)"],
          ["lengthCm", "Length (cm)"],
          ["widthCm", "Width (cm)"],
          ["heightCm", "Height (cm)"],
        ].map(([key, label]) => (
          <label className={styles.field} key={key}>
            <span>{label}</span>
            <input min="0" name={`details.${key}`} step="any" type="number" />
          </label>
        ))}
      </div>
    );
  }

  if (schema.productKind === "digital_product") {
    return (
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>
            Delivery method <em>Required</em>
          </span>
          <select
            defaultValue="download"
            name="details.deliveryMethod"
            required
          >
            <option value="download">Download</option>
            <option value="license_key">License key</option>
            <option value="streaming">Streaming</option>
            <option value="account_access">Account access</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>File format</span>
          <input name="details.fileFormat" placeholder="PDF, ZIP, MP4…" />
        </label>
        <label className={styles.field}>
          <span>Version</span>
          <input name="details.version" placeholder="2026.1" />
        </label>
        <label className={styles.field}>
          <span>Access duration (days)</span>
          <input min="1" name="details.accessDurationDays" type="number" />
        </label>
        <label className={styles.fieldWide}>
          <span>Fulfilment URL</span>
          <input name="details.fulfillmentUrl" type="url" />
        </label>
        <label className={styles.checkFieldWide}>
          <input name="details.licenseRequired" type="checkbox" />
          <span>
            <strong>License required</strong>
            <small>
              A saved license or entitlement is issued after purchase.
            </small>
          </span>
        </label>
      </div>
    );
  }

  if (schema.productKind === "service") {
    return (
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>
            Delivery mode <em>Required</em>
          </span>
          <select defaultValue="remote" name="details.deliveryMode" required>
            <option value="remote">Remote</option>
            <option value="in_person">In person</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Location</span>
          <input name="details.location" />
        </label>
        <label className={styles.fieldWide}>
          <span>Provider name</span>
          <input name="details.providerName" />
        </label>
        <label className={styles.checkFieldWide}>
          <input
            defaultChecked
            name="details.bookingRequired"
            type="checkbox"
          />
          <span>
            <strong>Booking required</strong>
            <small>The user must reserve a service slot.</small>
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className={styles.formGrid}>
      <label className={styles.field}>
        <span>Venue</span>
        <input name="details.venue" />
      </label>
      <label className={styles.field}>
        <span>
          Starts at <em>Required</em>
        </span>
        <input name="details.startsAt" required type="datetime-local" />
      </label>
      <label className={styles.field}>
        <span>
          Ends at <em>Required</em>
        </span>
        <input name="details.endsAt" required type="datetime-local" />
      </label>
      <label className={styles.field}>
        <span>
          Capacity <em>Required</em>
        </span>
        <input min="1" name="details.capacity" required type="number" />
      </label>
      <label className={styles.field}>
        <span>Minimum participants</span>
        <input
          defaultValue="1"
          min="1"
          name="details.minParticipants"
          type="number"
        />
      </label>
      <label className={styles.field}>
        <span>Timezone</span>
        <input defaultValue="Asia/Singapore" name="details.timezone" />
      </label>
      <label className={styles.field}>
        <span>Meeting point</span>
        <input name="details.meetingPoint" />
      </label>
    </div>
  );
}

function buildDetails(
  formData: FormData,
  schema: CategorySchema,
  productAttributes: Attributes,
  variantAttributes: Attributes[],
) {
  if (schema.productKind === "physical_good") {
    return {
      type: "physical_good",
      weightGrams: optionalNumber(formData, "details.weightGrams"),
      lengthCm: optionalNumber(formData, "details.lengthCm"),
      widthCm: optionalNumber(formData, "details.widthCm"),
      heightCm: optionalNumber(formData, "details.heightCm"),
      shippingRequired: formData.has("details.shippingRequired"),
    };
  }
  if (schema.productKind === "digital_product") {
    return {
      type: "digital_product",
      deliveryMethod: requiredText(formData, "details.deliveryMethod"),
      fileFormat: nullableText(formData, "details.fileFormat"),
      version: nullableText(formData, "details.version"),
      licenseRequired: formData.has("details.licenseRequired"),
      accessDurationDays: optionalNumber(
        formData,
        "details.accessDurationDays",
      ),
      fulfillmentUrl: nullableText(formData, "details.fulfillmentUrl"),
    };
  }
  if (schema.productKind === "service") {
    return {
      type: "service",
      serviceType: String(productAttributes.serviceType ?? ""),
      deliveryMode: requiredText(formData, "details.deliveryMode"),
      durationMinutes: Number(variantAttributes[0]?.durationMinutes ?? 0),
      location: nullableText(formData, "details.location"),
      providerName: nullableText(formData, "details.providerName"),
      bookingRequired: formData.has("details.bookingRequired"),
    };
  }
  return {
    type: "booking",
    destination: String(productAttributes.destination ?? ""),
    venue: nullableText(formData, "details.venue"),
    startsAt: localDateToIso(formData, "details.startsAt"),
    endsAt: localDateToIso(formData, "details.endsAt"),
    capacity: requiredNumber(formData, "details.capacity"),
    minParticipants: optionalNumber(formData, "details.minParticipants"),
    timezone: requiredText(formData, "details.timezone"),
    meetingPoint: nullableText(formData, "details.meetingPoint"),
  };
}

export function AddProductButton({
  merchantId,
  schemas,
}: {
  merchantId: string;
  schemas: CategorySchema[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    schemas[0]?.categoryId ?? "",
  );
  const [variants, setVariants] = useState([{ id: 1 }]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const schema = schemas.find(
    (candidate) => candidate.categoryId === selectedCategoryId,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (schema === undefined) return;
    const formData = new FormData(event.currentTarget);
    const productDefinitions = definitionsFor(schema, "product");
    const variantDefinitions = definitionsFor(schema, "variant");
    const basePrice = requiredNumber(formData, "basePrice");
    const productAttributes = readAttributes(
      formData,
      "product.attribute.",
      productDefinitions,
    );
    const variantInputs = variants.map(({ id }) => {
      const listedPrice = optionalNumber(formData, `variant.${id}.listedPrice`);
      return {
        externalId: nullableText(formData, `variant.${id}.externalId`),
        sku: nullableText(formData, `variant.${id}.sku`),
        name: nullableText(formData, `variant.${id}.name`),
        attributes: readAttributes(
          formData,
          `variant.${id}.attribute.`,
          variantDefinitions,
        ),
        ...(listedPrice === null ? {} : { listedPrice }),
        active: true,
        quantityAvailable: requiredNumber(
          formData,
          `variant.${id}.quantityAvailable`,
        ),
      };
    });
    const input = {
      merchantId,
      externalId: nullableText(formData, "externalId"),
      categoryId: schema.categoryId,
      name: requiredText(formData, "name"),
      description: nullableText(formData, "description"),
      brand: nullableText(formData, "brand"),
      basePrice,
      currency: "SGD" as const,
      imageUrl: nullableText(formData, "imageUrl"),
      attributes: productAttributes,
      variants: variantInputs,
      details: buildDetails(
        formData,
        schema,
        productAttributes,
        variantInputs.map((variant) => variant.attributes),
      ),
      active: true,
    };

    setFeedback(null);
    startTransition(async () => {
      const result = await createMerchantProductAction(input);
      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) router.refresh();
    });
  }

  return (
    <>
      <button
        className={styles.primaryButton}
        disabled={schemas.length === 0}
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        type="button"
      >
        <span aria-hidden="true">+</span> Add product
      </button>
      {open && schema !== undefined ? (
        <Modal
          description="The form changes automatically with the selected product type."
          eyebrow="Schema-guided onboarding"
          onClose={() => setOpen(false)}
          title="Add a catalog product"
          wide
        >
          <form className={styles.managementForm} onSubmit={submit}>
            <div className={styles.formSection}>
              <div className={styles.formSectionHeading}>
                <span>01</span>
                <div>
                  <h3>Product category</h3>
                  <p>Choose the closest comparable product type.</p>
                </div>
              </div>
              <label className={styles.fieldWide}>
                <span>
                  Category <em>Required</em>
                </span>
                <select
                  onChange={(event) => {
                    setSelectedCategoryId(event.target.value);
                    setVariants([{ id: Date.now() }]);
                    setFeedback(null);
                  }}
                  value={selectedCategoryId}
                >
                  {schemas.map((option) => (
                    <option key={option.categoryId} value={option.categoryId}>
                      {option.name} · {fieldLabel(option.commerceDomain)}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.schemaCallout}>
                <strong>
                  {schema.name} schema · v{schema.schemaVersion}
                </strong>
                <span>{fieldLabel(schema.productKind)}</span>
              </div>
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHeading}>
                <span>02</span>
                <div>
                  <h3>Core product information</h3>
                  <p>Stable fields shared by every commerce category.</p>
                </div>
              </div>
              <CoreProductFields />
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHeading}>
                <span>03</span>
                <div>
                  <h3>{schema.name} attributes</h3>
                  <p>Canonical fields used by product discovery.</p>
                </div>
              </div>
              <div className={styles.formGrid}>
                {definitionsFor(schema, "product").map(([key, definition]) => (
                  <AttributeField
                    definition={definition}
                    fieldKey={key}
                    key={key}
                    name={`product.attribute.${key}`}
                  />
                ))}
              </div>
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHeading}>
                <span>04</span>
                <div>
                  <h3>Fulfilment details</h3>
                  <p>Information specific to this purchase experience.</p>
                </div>
              </div>
              <ProductDetailsFields schema={schema} />
            </div>

            <div className={styles.formSection}>
              <div className={styles.formSectionHeading}>
                <span>05</span>
                <div>
                  <h3>Sellable variants</h3>
                  <p>
                    Each variant receives a stable ID, price, and inventory
                    record.
                  </p>
                </div>
              </div>
              <div className={styles.variantDraftList}>
                {variants.map(({ id }, index) => (
                  <fieldset className={styles.variantDraft} key={id}>
                    <legend>Variant {index + 1}</legend>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Variant name</span>
                        <input
                          name={`variant.${id}.name`}
                          placeholder="256GB / Black"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Price override (SGD)</span>
                        <input
                          min="0"
                          name={`variant.${id}.listedPrice`}
                          placeholder="Uses base price"
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <details className={styles.advancedFields}>
                        <summary>Already use your own SKU or IDs?</summary>
                        <p>
                          Optional. We generate a unique SKU automatically when
                          this is left blank.
                        </p>
                        <div className={styles.advancedFieldsGrid}>
                          <label className={styles.field}>
                            <span>Your existing SKU</span>
                            <input
                              name={`variant.${id}.sku`}
                              placeholder="Optional"
                            />
                          </label>
                          <label className={styles.field}>
                            <span>External system variant ID</span>
                            <input name={`variant.${id}.externalId`} />
                          </label>
                        </div>
                      </details>
                      {definitionsFor(schema, "variant").map(
                        ([key, definition]) => (
                          <AttributeField
                            definition={definition}
                            fieldKey={key}
                            key={key}
                            name={`variant.${id}.attribute.${key}`}
                          />
                        ),
                      )}
                      <label className={styles.field}>
                        <span>
                          Initial inventory <em>Required</em>
                        </span>
                        <input
                          defaultValue="0"
                          min="0"
                          name={`variant.${id}.quantityAvailable`}
                          required
                          type="number"
                        />
                      </label>
                    </div>
                    {variants.length > 1 ? (
                      <button
                        className={styles.removeVariantButton}
                        onClick={() =>
                          setVariants((current) =>
                            current.filter((variant) => variant.id !== id),
                          )
                        }
                        type="button"
                      >
                        Remove variant
                      </button>
                    ) : null}
                  </fieldset>
                ))}
              </div>
              <button
                className={styles.secondaryButton}
                onClick={() =>
                  setVariants((current) => [
                    ...current,
                    { id: Math.max(...current.map(({ id }) => id)) + 1 },
                  ])
                }
                type="button"
              >
                + Add another variant
              </button>
            </div>

            <FeedbackMessage feedback={feedback} />
            <div className={styles.formFooter}>
              <button
                className={styles.secondaryButton}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={pending}
                type="submit"
              >
                {pending ? "Adding product…" : "Add to catalog"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function EditProductDialog({
  product,
  schema,
  onClose,
}: {
  product: MerchantProduct;
  schema: CategorySchema | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const knownAttributes =
      schema === undefined
        ? {}
        : readAttributes(
            formData,
            "product.attribute.",
            definitionsFor(schema, "product"),
          );
    const input = {
      externalId: nullableText(formData, "externalId"),
      name: requiredText(formData, "name"),
      description: nullableText(formData, "description"),
      brand: nullableText(formData, "brand"),
      basePrice: requiredNumber(formData, "basePrice"),
      imageUrl: nullableText(formData, "imageUrl"),
      attributes: { ...product.attributes, ...knownAttributes },
    };
    setFeedback(null);
    startTransition(async () => {
      const result = await updateMerchantProductAction(
        product.productId,
        input,
      );
      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) router.refresh();
    });
  }

  return (
    <Modal
      description={`${product.categoryName} · Category and fulfilment type remain stable.`}
      eyebrow="Catalog editor"
      onClose={onClose}
      title={`Edit ${product.name}`}
      wide
    >
      <form className={styles.managementForm} onSubmit={submit}>
        <div className={styles.formSection}>
          <div className={styles.formSectionHeading}>
            <span>01</span>
            <div>
              <h3>Core information</h3>
              <p>Update the product identity and listed base price.</p>
            </div>
          </div>
          <CoreProductFields product={product} />
        </div>
        {schema !== undefined ? (
          <div className={styles.formSection}>
            <div className={styles.formSectionHeading}>
              <span>02</span>
              <div>
                <h3>{schema.name} attributes</h3>
                <p>Required canonical fields cannot be removed.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              {definitionsFor(schema, "product").map(([key, definition]) => (
                <AttributeField
                  defaultValue={product.attributes[key]}
                  definition={definition}
                  fieldKey={key}
                  key={key}
                  name={`product.attribute.${key}`}
                />
              ))}
            </div>
          </div>
        ) : null}
        <FeedbackMessage feedback={feedback} />
        <div className={styles.formFooter}>
          <button
            className={styles.secondaryButton}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className={styles.primaryButton}
            disabled={pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PricingDialog({
  product,
  onClose,
}: {
  product: MerchantProduct;
  onClose: () => void;
}) {
  const router = useRouter();
  const [negotiationEnabled, setNegotiationEnabled] = useState(false);
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maxDiscountPercent, setMaxDiscountPercent] = useState("");
  const [inventoryDiscountEnabled, setInventoryDiscountEnabled] =
    useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      const result = await getMerchantPricingPolicyAction(product.productId);
      if (!active) return;
      if (!result.success) {
        setFeedback({ tone: "error", message: result.message });
        return;
      }
      if (result.data !== null) {
        setNegotiationEnabled(result.data.negotiationEnabled);
        setMinimumPrice(result.data.minimumPrice?.toString() ?? "");
        setMaxDiscountPercent(result.data.maxDiscountPercent?.toString() ?? "");
        setInventoryDiscountEnabled(result.data.inventoryDiscountEnabled);
      }
    });
    return () => {
      active = false;
    };
  }, [product.productId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await configureMerchantPricingAction(product.productId, {
        negotiationEnabled,
        minimumPrice: negotiationEnabled ? Number(minimumPrice) : null,
        maxDiscountPercent:
          negotiationEnabled && maxDiscountPercent.length > 0
            ? Number(maxDiscountPercent)
            : null,
        inventoryDiscountEnabled:
          negotiationEnabled && inventoryDiscountEnabled,
      });
      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) router.refresh();
    });
  }

  return (
    <Modal
      description="These limits remain private and are never exposed through MCP."
      eyebrow="Private pricing policy"
      onClose={onClose}
      title={`Pricing for ${product.name}`}
    >
      <form className={styles.managementForm} onSubmit={submit}>
        <label className={styles.switchField}>
          <span>
            <strong>Enable policy-based offers</strong>
            <small>
              Allow bounded discounts without revealing your minimum.
            </small>
          </span>
          <input
            checked={negotiationEnabled}
            onChange={(event) => setNegotiationEnabled(event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Minimum price (SGD)</span>
            <input
              disabled={!negotiationEnabled}
              max={product.basePrice}
              min="0"
              onChange={(event) => setMinimumPrice(event.target.value)}
              required={negotiationEnabled}
              step="0.01"
              type="number"
              value={minimumPrice}
            />
          </label>
          <label className={styles.field}>
            <span>Maximum discount (%)</span>
            <input
              disabled={!negotiationEnabled}
              max="100"
              min="0"
              onChange={(event) => setMaxDiscountPercent(event.target.value)}
              step="0.01"
              type="number"
              value={maxDiscountPercent}
            />
          </label>
        </div>
        <label className={styles.checkFieldWide}>
          <input
            checked={inventoryDiscountEnabled}
            disabled={!negotiationEnabled}
            onChange={(event) =>
              setInventoryDiscountEnabled(event.target.checked)
            }
            type="checkbox"
          />
          <span>
            <strong>Inventory-aware discount</strong>
            <small>
              Let available stock influence the bounded offer price.
            </small>
          </span>
        </label>
        <FeedbackMessage feedback={feedback} />
        <div className={styles.formFooter}>
          <button
            className={styles.secondaryButton}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className={styles.primaryButton}
            disabled={pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save pricing policy"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProductManagementActions({
  product,
  schema,
}: {
  product: MerchantProduct;
  schema: CategorySchema | undefined;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<
    "edit" | "pricing" | "availability" | null
  >(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function toggleAvailability() {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateMerchantProductAction(product.productId, {
        active: !product.active,
      });
      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) router.refresh();
    });
  }

  return (
    <>
      <div className={styles.rowActions}>
        <button onClick={() => setDialog("edit")} type="button">
          Edit
        </button>
        <button onClick={() => setDialog("pricing")} type="button">
          Pricing
        </button>
        <button
          className={product.active ? styles.pauseAction : styles.resumeAction}
          onClick={() => setDialog("availability")}
          type="button"
        >
          {product.active ? "Pause" : "Resume"}
        </button>
      </div>
      {dialog === "edit" ? (
        <EditProductDialog
          product={product}
          schema={schema}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "pricing" ? (
        <PricingDialog product={product} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "availability" ? (
        <Modal
          description={
            product.active
              ? "The product stays in your records but disappears from Agent search."
              : "The product becomes discoverable again immediately."
          }
          eyebrow="Catalog availability"
          onClose={() => setDialog(null)}
          title={`${product.active ? "Pause" : "Resume"} ${product.name}?`}
        >
          <div className={styles.confirmPanel}>
            <span
              className={
                product.active ? styles.warningMark : styles.successMark
              }
            >
              {product.active ? "!" : "✓"}
            </span>
            <p>
              {product.active
                ? "Existing orders and stable product IDs are preserved. You can resume selling at any time."
                : "Current pricing, variants, and inventory will be used when the product returns."}
            </p>
          </div>
          <FeedbackMessage feedback={feedback} />
          <div className={styles.formFooter}>
            <button
              className={styles.secondaryButton}
              onClick={() => setDialog(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={
                product.active ? styles.dangerButton : styles.primaryButton
              }
              disabled={pending}
              onClick={toggleAvailability}
              type="button"
            >
              {pending
                ? "Updating…"
                : product.active
                  ? "Pause product"
                  : "Resume product"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function VariantManagementButton({
  product,
  variant,
  schema,
}: {
  product: MerchantProduct;
  variant: ProductVariant;
  schema: CategorySchema | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const knownAttributes =
      schema === undefined
        ? {}
        : readAttributes(
            formData,
            "variant.attribute.",
            definitionsFor(schema, "variant"),
          );
    const input = {
      externalId: nullableText(formData, "externalId"),
      sku: nullableText(formData, "sku"),
      name: nullableText(formData, "name"),
      listedPrice: requiredNumber(formData, "listedPrice"),
      attributes: { ...variant.attributes, ...knownAttributes },
      active: formData.has("active"),
      quantityAvailable: requiredNumber(formData, "quantityAvailable"),
    };
    setFeedback(null);
    startTransition(async () => {
      const result = await updateMerchantVariantAction(
        variant.variantId,
        input,
      );
      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) router.refresh();
    });
  }

  return (
    <>
      <button
        className={styles.inventoryManageButton}
        onClick={() => setOpen(true)}
        type="button"
      >
        Manage
      </button>
      {open ? (
        <Modal
          description={`${product.name} · Changes sync to discovery and inventory.`}
          eyebrow="Variant and inventory"
          onClose={() => setOpen(false)}
          title={variant.name ?? variant.sku ?? "Manage variant"}
          wide
        >
          <form className={styles.managementForm} onSubmit={submit}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Variant name</span>
                <input defaultValue={variant.name ?? ""} name="name" />
              </label>
              <label className={styles.field}>
                <span>
                  Listed price (SGD) <em>Required</em>
                </span>
                <input
                  defaultValue={variant.listedPrice}
                  min="0"
                  name="listedPrice"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              {schema === undefined
                ? null
                : definitionsFor(schema, "variant").map(([key, definition]) => (
                    <AttributeField
                      defaultValue={variant.attributes[key]}
                      definition={definition}
                      fieldKey={key}
                      key={key}
                      name={`variant.attribute.${key}`}
                    />
                  ))}
              <label className={styles.field}>
                <span>
                  Total inventory <em>Required</em>
                </span>
                <input
                  defaultValue={variant.quantityAvailable ?? 0}
                  min={variant.quantityReserved ?? 0}
                  name="quantityAvailable"
                  required
                  type="number"
                />
                <small>
                  {variant.quantityReserved ?? 0} currently reserved by orders
                </small>
              </label>
              <label className={styles.checkField}>
                <input
                  defaultChecked={variant.active}
                  name="active"
                  type="checkbox"
                />
                <span>
                  <strong>Variant active</strong>
                  <small>Inactive variants are excluded from discovery.</small>
                </span>
              </label>
              <details className={styles.advancedFields}>
                <summary>Already use your own SKU or IDs?</summary>
                <p>
                  Optional integration fields. The platform keeps its own
                  internal variant ID automatically.
                </p>
                <div className={styles.advancedFieldsGrid}>
                  <label className={styles.field}>
                    <span>Your existing SKU</span>
                    <input defaultValue={variant.sku ?? ""} name="sku" />
                  </label>
                  <label className={styles.field}>
                    <span>External system variant ID</span>
                    <input
                      defaultValue={variant.externalId ?? ""}
                      name="externalId"
                    />
                  </label>
                </div>
              </details>
            </div>
            <FeedbackMessage feedback={feedback} />
            <div className={styles.formFooter}>
              <button
                className={styles.secondaryButton}
                onClick={() => setOpen(false)}
                type="button"
              >
                Close
              </button>
              <button
                className={styles.primaryButton}
                disabled={pending}
                type="submit"
              >
                {pending ? "Saving…" : "Save variant"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
