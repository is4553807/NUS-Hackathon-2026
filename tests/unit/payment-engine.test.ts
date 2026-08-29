import { describe, expect, it } from "vitest";

import {
  fingerprintPaymentCredential,
  isPaymentMethodExpired,
  simulateVisaAuthorization,
} from "../../packages/commerce/src/index.js";

const requestId = "d74ef34f-f72b-4bd4-bd5a-bf03f98d5cd3";

describe("mock Visa payment adapter", () => {
  it("authorizes the success token with verified cardholder state", () => {
    expect(
      simulateVisaAuthorization({
        requestId,
        paymentCredentialReference: "vault_mock_visa_authorized",
      }),
    ).toMatchObject({
      status: "authorized",
      cardholderVerified: true,
      authorizationReference: "VISA-DEMO-D74EF34FF72B4BD4",
      failureCode: null,
    });
  });

  it.each([
    ["vault_mock_visa_declined", "declined", "PAYMENT_DECLINED"],
    [
      "vault_mock_visa_verification",
      "requires_verification",
      "IDENTITY_VERIFICATION_REQUIRED",
    ],
    ["vault_mock_visa_failed", "failed", "PAYMENT_FAILED"],
  ] as const)("maps %s to %s", (reference, status, failureCode) => {
    expect(
      simulateVisaAuthorization({
        requestId,
        paymentCredentialReference: reference,
      }),
    ).toMatchObject({
      status,
      authorizationReference: null,
      failureCode,
    });
  });

  it("stores only a deterministic SHA-256 credential fingerprint", () => {
    const reference = "vault_mock_visa_authorized";
    const fingerprint = fingerprintPaymentCredential(reference);

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain(reference);
    expect(fingerprintPaymentCredential(reference)).toBe(fingerprint);
  });

  it("rejects a saved payment method only after its expiry month", () => {
    expect(
      isPaymentMethodExpired(
        { expiryMonth: 8, expiryYear: 2026 },
        new Date("2026-08-30T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      isPaymentMethodExpired(
        { expiryMonth: 7, expiryYear: 2026 },
        new Date("2026-08-30T12:00:00Z"),
      ),
    ).toBe(true);
  });
});
