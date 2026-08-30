import type { RealOffer } from "./domain-types.js";

export interface CommerceSummarySource {
  productName: string;
  merchantName: string;
  price: number;
  currency: string;
  attributes: Record<string, string | number | boolean>;
  commerceDomain?: RealOffer["commerceDomain"];
}

function words(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)}`;
}

function detailValue([key, rawValue]: [
  string,
  string | number | boolean,
]): string {
  const label = words(key);
  if (typeof rawValue === "boolean") return rawValue ? label : `no ${label}`;

  const value = words(String(rawValue));
  const unitSuffix = label.match(
    /^(.*)\s(gb|tb|mb|kb|hours?|minutes?|inches?)$/iu,
  );
  if (unitSuffix !== null && /^\d+(?:\.\d+)?$/u.test(value)) {
    const baseLabel = unitSuffix[1]?.trim() ?? "";
    const rawUnit = unitSuffix[2]?.toLocaleLowerCase("en") ?? "";
    if (
      baseLabel.toLocaleLowerCase("en") === "duration" &&
      /^(?:hours?|minutes?)$/u.test(rawUnit)
    ) {
      const unit = rawUnit.replace(/s$/u, "");
      return `a ${value}-${unit} duration`;
    }
    const unit = /^(?:gb|tb|mb|kb)$/u.test(rawUnit)
      ? rawUnit.toUpperCase()
      : rawUnit;
    const displayLabel =
      baseLabel.length <= 4 ? baseLabel.toUpperCase() : baseLabel;
    return `${value} ${unit}${displayLabel.length > 0 ? ` ${displayLabel}` : ""}`;
  }
  if (/\d/u.test(value)) {
    const normalizedLabel = label.toLocaleLowerCase("en");
    const displayLabel = label.length <= 4 ? label.toUpperCase() : label;
    return value.toLocaleLowerCase("en").includes(normalizedLabel)
      ? value
      : `${value} ${displayLabel}`;
  }
  if (label.toLocaleLowerCase("en") === "language") {
    return `${value} language`;
  }
  return value;
}

function rankedDetails(
  attributes: CommerceSummarySource["attributes"],
): string[] {
  return Object.entries(attributes)
    .sort((a, b) => {
      const aHasNumber = /\d/u.test(String(a[1])) ? 1 : 0;
      const bHasNumber = /\d/u.test(String(b[1])) ? 1 : 0;
      return bHasNumber - aHasNumber;
    })
    .slice(0, 2)
    .map(detailValue)
    .filter((detail) => detail.length > 0);
}

/**
 * The single offer-summary rendering path used by provisional items and
 * final comparisons. It deliberately turns the authoritative fields into
 * a sentence; no caller is allowed to dump an attributes object into UI
 * copy directly.
 */
export function composeCommerceSummary(source: CommerceSummarySource): string {
  const details = rankedDetails(source.attributes);
  const identity = `${source.productName} from ${source.merchantName} is ${formatMoney(source.currency, source.price)}`;
  if (details.length === 0) return `${identity}.`;

  const joined =
    details.length === 1 ? details[0] : `${details[0]} and ${details[1]}`;
  if (source.commerceDomain === "services_subscriptions") {
    return `${identity}. Key details are ${joined}.`;
  }
  return `${identity} and includes ${joined}.`;
}

export function composeOfferSummary(offer: RealOffer): string {
  return composeCommerceSummary({
    productName: offer.productName,
    merchantName: offer.merchantName,
    price: offer.offeredPrice,
    currency: offer.currency,
    attributes: offer.attributes,
    commerceDomain: offer.commerceDomain,
  });
}
