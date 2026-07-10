import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { FREE_EXPORT_LIMIT } from "./constants";
import {
  checkExportAllowed,
  consumeExport,
  InMemoryQuotaStore,
  MAX_SIGNED_TRANSACTION_CHARS,
  redeemCreditPack,
} from "./entitlement";
import { __resetCreditStoreForTests, getCreditBalance } from "./credit-store";

// ── Deterministic test PKI (EC P-256 / ES256 — same self-signed chain as app-store-jws.test.ts) ──
const LEAF_DER_B64 =
  "MIIByjCCAXGgAwIBAgIUChJ4QNZAn7jH/7B/CBTgVE9t5owwCgYIKoZIzj0EAwIwPTEdMBsGA1UEAwwUVGVzdCBJbnRlcm1lZGlhdGUgQ0ExHDAaBgNVBAoME0hpZ2hsaWdodE1hZ2ljIFRlc3QwHhcNMjYwNjI3MTIxMDQ5WhcNMzYwNjI0MTIxMDQ5WjAyMRIwEAYDVQQDDAlUZXN0IExlYWYxHDAaBgNVBAoME0hpZ2hsaWdodE1hZ2ljIFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATdFT63pnnn8HYMPgu75a6TwZKw8EanxVm0NeSOIRzvtWxPT4aavbLD4KAbbQ2AhmTZQsA4i83UGnYoByM2ndQCo1owWDAJBgNVHRMEAjAAMAsGA1UdDwQEAwIHgDAdBgNVHQ4EFgQUk9RMsR+jC6nOXGYi+fEPFQ4zrx0wHwYDVR0jBBgwFoAUWkqleO8+DEuUbGz2FmD0HIvy3pgwCgYIKoZIzj0EAwIDRwAwRAIgLvWdy7x6gK60Phkk1Gn7U6RilN6h81Aa85gvgYltUtwCIAVYZWDhIIuGARyWdEsCV0EDeJAJBh2rWyK1UQdc3TV3";
const INT_DER_B64 =
  "MIIB0DCCAXegAwIBAgIUbkwfEM4/ivaRoPOx5/CcpwVcRmIwCgYIKoZIzj0EAwIwNTEVMBMGA1UEAwwMVGVzdCBSb290IENBMRwwGgYDVQQKDBNIaWdobGlnaHRNYWdpYyBUZXN0MB4XDTI2MDYyNzEyMTA0OVoXDTM2MDYyNDEyMTA0OVowPTEdMBsGA1UEAwwUVGVzdCBJbnRlcm1lZGlhdGUgQ0ExHDAaBgNVBAoME0hpZ2hsaWdodE1hZ2ljIFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASHiaaemIy8FQglzPZXd8LJR185Fr0YtqFSPy2aXRSOiYz61eG+4FCupdDBX4RKKGja8nwPHWPzSe0BjC1HyydRo10wWzAMBgNVHRMEBTADAQH/MAsGA1UdDwQEAwIBBjAdBgNVHQ4EFgQUWkqleO8+DEuUbGz2FmD0HIvy3pgwHwYDVR0jBBgwFoAUv/9f5P7sOAyWS2JfEkNvHhBCd/owCgYIKoZIzj0EAwIDRwAwRAIfRUJQbl+ESjIdwIaqlIQDBSSIm7ehNn0vdF5XJFayuQIhAPmWbqibEhK4PagmnXNiS8EUTqIL452dgi32S8nuyf9J";
const ROOT_DER_B64 =
  "MIIBvjCCAWWgAwIBAgIUdVKfS4ZTN7uf65iQ8/ouYU1BJDQwCgYIKoZIzj0EAwIwNTEVMBMGA1UEAwwMVGVzdCBSb290IENBMRwwGgYDVQQKDBNIaWdobGlnaHRNYWdpYyBUZXN0MB4XDTI2MDYyNzEyMTA0OVoXDTM2MDYyNDEyMTA0OVowNTEVMBMGA1UEAwwMVGVzdCBSb290IENBMRwwGgYDVQQKDBNIaWdobGlnaHRNYWdpYyBUZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhZY2CdMebwwEl3tt81EMyYSQJkRuFrPWO7GrH4u7HaAPpuHT6WVhqjm0NxAxNaWvHSHKyujFc8E6++85pEYpxaNTMFEwHQYDVR0OBBYEFL//X+T+7DgMlktiXxJDbx4QQnf6MB8GA1UdIwQYMBaAFL//X+T+7DgMlktiXxJDbx4QQnf6MA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDRwAwRAIgIL4c7SuV7AvGRQhw+mQ4YyMu6yGolBcVDjyNrcLt3e4CIAIjVhH8m9Cfyct8fGYPHlvwjsN0mm5Wn2RNy2xPsKkX";
const LEAF_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1FYJhx3nWf98AU4g
3/k2J1Qy2jAAI6QJ5B1XM8dNs8WhRANCAATdFT63pnnn8HYMPgu75a6TwZKw8Ean
xVm0NeSOIRzvtWxPT4aavbLD4KAbbQ2AhmTZQsA4i83UGnYoByM2ndQC
-----END PRIVATE KEY-----`;

const rootDer = Buffer.from(ROOT_DER_B64, "base64");
const leafKey = crypto.createPrivateKey(LEAF_KEY_PEM);

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
function rootPem(der: Buffer): string {
  return `-----BEGIN CERTIFICATE-----\n${der.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----`;
}
/** Build a JWS the way StoreKit does: header(x5c) + payload + ES256 leaf signature. */
function makeJWS(payload: object): string {
  const header = { alg: "ES256", x5c: [LEAF_DER_B64, INT_DER_B64, ROOT_DER_B64] };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sig = crypto.sign("sha256", Buffer.from(signingInput), {
    key: leafKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(sig)}`;
}

/** A valid consumable credit-pack purchase (no expiresDate — consumables never expire). */
function creditPackTxn(overrides: Record<string, unknown> = {}) {
  return {
    bundleId: "com.highlightmagic.app",
    productId: "credits.medium", // 30 credits per constants.CREDIT_PACK_PRODUCTS
    type: "Consumable",
    transactionId: "txn-abc-123",
    ...overrides,
  };
}

describe("redeemCreditPack", () => {
  beforeEach(() => {
    __resetCreditStoreForTests();
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    delete process.env.APP_STORE_BUNDLE_ID;
  });
  afterEach(() => {
    delete process.env.APP_STORE_ROOT_CA_PEM;
    delete process.env.APP_STORE_BUNDLE_ID;
  });

  it("grants the mapped credits for a verified credit-pack transaction", async () => {
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(creditPackTxn()) });
    expect(r.ok).toBe(true);
    expect(r.granted).toBe(30);
    expect(r.balance).toBe(30);
    expect(await getCreditBalance("u1")).toBe(30);
  });

  it("is idempotent: replaying the same transactionId grants nothing", async () => {
    const jws = makeJWS(creditPackTxn());
    await redeemCreditPack({ userId: "u1", signedTransaction: jws });
    const replay = await redeemCreditPack({ userId: "u1", signedTransaction: jws });
    expect(replay.ok).toBe(true);
    expect(replay.duplicate).toBe(true);
    expect(replay.granted).toBe(0);
    expect(await getCreditBalance("u1")).toBe(30); // not 60 — replay cannot mint credits
  });

  it("rejects a transaction for an unknown / non-credit product (e.g. the Pro sub)", async () => {
    const r = await redeemCreditPack({
      userId: "u1",
      signedTransaction: makeJWS(creditPackTxn({ productId: "pro.monthly" })),
    });
    expect(r.ok).toBe(false);
    expect(r.granted).toBe(0);
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("rejects a refunded (revoked) purchase", async () => {
    const r = await redeemCreditPack({
      userId: "u1",
      signedTransaction: makeJWS(creditPackTxn({ revocationDate: 1_700_000_000_000 })),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("purchase refunded");
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("rejects a transaction missing a transactionId (no idempotency key → could replay)", async () => {
    const txn = creditPackTxn();
    delete (txn as Record<string, unknown>).transactionId;
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(txn) });
    expect(r.ok).toBe(false);
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("rejects a transaction for another app when the bundle id is configured", async () => {
    process.env.APP_STORE_BUNDLE_ID = "com.someone.else";
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(creditPackTxn()) });
    expect(r.ok).toBe(false);
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("grants nothing when no trusted Apple root is configured (secure default)", async () => {
    delete process.env.APP_STORE_ROOT_CA_PEM;
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(creditPackTxn()) });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("purchase verification unavailable");
  });

  it("rejects a garbage / unsigned transaction", async () => {
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: "not-a-jws" });
    expect(r.ok).toBe(false);
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("rejects a missing signedTransaction", async () => {
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing signedTransaction");
  });

  // ── H2 input-bound guards (Track H): these return BEFORE any KV-key derivation or ES256 verify,
  // so a hostile client cannot mint a pathological credit-balance key or burn CPU on an oversized
  // JWS. Regressing either check would reopen a wallet-of-CPU / KV-key-injection surface. ──

  it("rejects an empty / over-long userId before it becomes a credit-balance KV key (H2)", async () => {
    // Empty is invalid; so is anything over MAX_USER_ID_CHARS (128). Uses a plainly-invalid
    // signedTransaction to prove the userId guard fires FIRST (no JWS work happens).
    const empty = await redeemCreditPack({ userId: "", signedTransaction: "irrelevant" });
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe("missing userId");
    expect(empty.granted).toBe(0);

    const overLong = await redeemCreditPack({ userId: "u".repeat(129), signedTransaction: "irrelevant" });
    expect(overLong.ok).toBe(false);
    expect(overLong.reason).toBe("missing userId");
    // Nothing was granted to the pathological key.
    expect(await getCreditBalance("u".repeat(129))).toBe(0);
  });

  it("rejects an over-length signedTransaction before the ES256 verify (H2 CPU-DoS guard)", async () => {
    const oversized = "a".repeat(MAX_SIGNED_TRANSACTION_CHARS + 1);
    const r = await redeemCreditPack({ userId: "u1", signedTransaction: oversized });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid transaction");
    expect(await getCreditBalance("u1")).toBe(0);
  });
});

describe("credit fallback in the export gate", () => {
  beforeEach(() => {
    __resetCreditStoreForTests();
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
  });
  afterEach(() => delete process.env.APP_STORE_ROOT_CA_PEM);

  /** A quota store already at the free monthly limit for `userId`. */
  async function exhaustedStore(userId: string): Promise<InMemoryQuotaStore> {
    const store = new InMemoryQuotaStore();
    const period = new Date();
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) {
      await store.increment(userId, `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return store;
  }

  it("blocks a free user at the limit with no credits", async () => {
    const store = await exhaustedStore("u1");
    const d = await checkExportAllowed({ userId: "u1", store });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("free monthly limit reached");
  });

  it("allows an over-limit free user WITH credits, flagged viaCredit", async () => {
    const store = await exhaustedStore("u1");
    await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(creditPackTxn()) });
    const d = await checkExportAllowed({ userId: "u1", store });
    expect(d.allowed).toBe(true);
    expect(d.isPro).toBe(false);
    expect(d.viaCredit).toBe(true);
    expect(d.creditsRemaining).toBe(30);
  });

  it("consumeExport spends a credit (not the maxed monthly counter) once over the limit", async () => {
    const store = await exhaustedStore("u1");
    await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(creditPackTxn()) });
    await consumeExport({ userId: "u1", isPro: false, store });
    expect(await getCreditBalance("u1")).toBe(29);
  });

  it("consumeExport spends free quota (not a credit) while still under the limit", async () => {
    const store = new InMemoryQuotaStore();
    await redeemCreditPack({ userId: "u1", signedTransaction: makeJWS(creditPackTxn()) });
    await consumeExport({ userId: "u1", isPro: false, store }); // used 0 < limit → monthly
    expect(await getCreditBalance("u1")).toBe(30); // credit untouched
  });

  it("re-blocks once credits are spent down to zero", async () => {
    const store = await exhaustedStore("u1");
    await redeemCreditPack({
      userId: "u1",
      signedTransaction: makeJWS(creditPackTxn({ productId: "credits.small", transactionId: "t-small" })),
    }); // 10 credits
    for (let i = 0; i < 10; i++) await consumeExport({ userId: "u1", isPro: false, store });
    expect(await getCreditBalance("u1")).toBe(0);
    const d = await checkExportAllowed({ userId: "u1", store });
    expect(d.allowed).toBe(false);
  });
});
