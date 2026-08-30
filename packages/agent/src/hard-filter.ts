import type {
  HardFilterResult,
  RealOffer,
  ResolvedUserIntent,
} from "./domain-types.js";

function normalize(value: string | number | boolean): string {
  return String(value).trim().toLocaleLowerCase("en");
}

/**
 * CLAUDE.md rule 2 / AGENT_SPEC.md §6 Step A: plain, deterministic code.
 * This is the ONLY function allowed to decide whether an offer survives a
 * hard constraint — never the model's own reasoning, no matter how the
 * offer arrived (a real live tool result, or a fabricated one fed in for
 * testing). Called both as the post-hoc independent re-check (AGENT_SPEC.md
 * §4) and as the source of truth Step B is restricted to reasoning over.
 */
export function applyHardFilter(
  offers: RealOffer[],
  intent: ResolvedUserIntent,
): HardFilterResult {
  const survivors: RealOffer[] = [];
  const rejections: HardFilterResult["rejections"] = [];
  const deadline = intent.deliveryDeadline ?? intent.scheduleDeadline;

  for (const offer of offers) {
    if (offer.status !== "active") {
      rejections.push({
        offerId: offer.offerId,
        reason: "UNAVAILABLE",
        detail: `Offer status is "${offer.status}".`,
      });
      continue;
    }

    if (offer.quantityAvailable < intent.quantity || !offer.deliveryAvailable) {
      rejections.push({
        offerId: offer.offerId,
        reason: "UNAVAILABLE",
        detail: "Insufficient stock or no fulfillment option.",
      });
      continue;
    }

    if (offer.offeredPrice > intent.budgetMax) {
      rejections.push({
        offerId: offer.offerId,
        reason: "OVER_BUDGET",
        detail: `Offered price ${offer.offeredPrice} exceeds budget ${intent.budgetMax}.`,
      });
      continue;
    }

    const missingAttribute = Object.entries(intent.requiredAttributes).find(
      ([key, requiredValue]) => {
        const actual = offer.attributes[key];
        return (
          actual === undefined || normalize(actual) !== normalize(requiredValue)
        );
      },
    );
    if (missingAttribute !== undefined) {
      rejections.push({
        offerId: offer.offerId,
        reason: "MISSING_REQUIRED_FEATURE",
        detail: `Required "${missingAttribute[0]}" = "${missingAttribute[1]}" not met.`,
      });
      continue;
    }

    if (
      deadline !== undefined &&
      offer.deliveryEstimate !== null &&
      new Date(offer.deliveryEstimate).getTime() > new Date(deadline).getTime()
    ) {
      rejections.push({
        offerId: offer.offerId,
        reason: "MISSED_DEADLINE",
        detail: `Delivery estimate ${offer.deliveryEstimate} is after the ${deadline} deadline.`,
      });
      continue;
    }

    survivors.push(offer);
  }

  return { survivors, rejections };
}
