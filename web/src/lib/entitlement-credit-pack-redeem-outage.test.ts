import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Credit-PACK REDEMPTION resilience when the credit ledger is unavailable.
 *
 * entitlement-credit-outage.test.ts covers the credit-store failure branches on the EXPORT paths
 * (checkExportAllowed / consumeExport). This file covers the remaining revenue-critical branch:
 * redeemCreditPack — the endpoint that turns a verified StoreKit consumable purchase into granted
 * credits. Its grant call is wrapped so a KV blip on the ledger fails CLOSED with a retryable
 * result instead of throwing an uncaught 500 out of /api/credits/redeem (which would leave the user
 * charged-by-Apple-but-not-credited with only a 500 to show for it). That fail-closed branch
 * (entitlement.ts: `catch (err) → { ok:false, reason:"credit store unavailable" }`) had no test.
 *
 * We mock ./app-store-jws so a VALID credit-pack transaction reaches the grant call without needing
 * the full ES256 PKI harness, and ./credit-store so grantCredits can be driven to throw.
 */

vi.mock("./app-store-jws", () => ({
  // Non-empty → redeemCreditPack does NOT short-circuit on "purchase verification unavailable".
  loadTrustedRootsFromEnv: vi.fn(() => [Buffer.from("fake-root-der")]),
  // A valid, non-revoked credit-pack transaction with an idempotency key.
  verifyAppStoreJWS: vi.fn(() => ({
    productId: "credits.small", // maps to 10 credits in CREDIT_PACK_PRODUCTS
    transactionId: "txn-redeem-1",
  })),
}));

vi.mock("./credit-store", () => ({
  grantCredits: vi.fn(),
  getCreditBalance: vi.fn(),
  consumeCredit: vi.fn(),
}));

import { redeemCreditPack } from "./entitlement";
import { grantCredits } from "./credit-store";

const mockedGrantCredits = vi.mocked(grantCredits);

// redeemCreditPack only reaches the grant call for a JWS under the size bound; any non-empty string
// within MAX_SIGNED_TRANSACTION_CHARS works because verifyAppStoreJWS is mocked to accept it.
const SIGNED = "signed-transaction-jws";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("redeemCreditPack — credit-ledger outage resilience", () => {
  it("fails CLOSED (no uncaught throw) when grantCredits throws — user gets a retryable result, not a 500", async () => {
    mockedGrantCredits.mockRejectedValueOnce(new Error("KV unreachable"));
    const res = await redeemCreditPack({ userId: "buyer-1", signedTransaction: SIGNED });
    expect(res.ok).toBe(false);
    expect(res.granted).toBe(0);
    expect(res.balance).toBe(0);
    expect(res.reason).toBe("credit store unavailable");
    expect(mockedGrantCredits).toHaveBeenCalledWith("buyer-1", 10, "txn-redeem-1");
  });

  it("does not reject the promise when the ledger throws (the route can't 500)", async () => {
    mockedGrantCredits.mockRejectedValueOnce(new Error("KV unreachable"));
    await expect(
      redeemCreditPack({ userId: "buyer-1", signedTransaction: SIGNED }),
    ).resolves.toBeDefined();
  });

  it("control: grants credits when the ledger SUCCEEDS (proves fail-closed is throw-specific, not a blanket deny)", async () => {
    mockedGrantCredits.mockResolvedValueOnce({ granted: 10, balance: 10, duplicate: false });
    const res = await redeemCreditPack({ userId: "buyer-1", signedTransaction: SIGNED });
    expect(res.ok).toBe(true);
    expect(res.granted).toBe(10);
    expect(res.balance).toBe(10);
    expect(res.duplicate).toBe(false);
  });
});
