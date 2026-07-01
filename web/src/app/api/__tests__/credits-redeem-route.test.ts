/**
 * /api/credits/redeem route tests — the consumable export-credit-pack redemption endpoint.
 * Exercises the real entitlement/JWS path (in-memory credit store) with a self-signed test chain.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { POST } from "@/app/api/credits/redeem/route";
import { __resetCreditStoreForTests, getCreditBalance } from "@/lib/credit-store";
import { _resetBuckets } from "@/lib/rate-limit";

// Same self-signed EC P-256 chain as app-store-jws.test.ts / credit-redemption.test.ts.
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
const b64url = (buf: Buffer) => buf.toString("base64url");
const rootPem = (der: Buffer) =>
  `-----BEGIN CERTIFICATE-----\n${der.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----`;

function makeJWS(payload: object): string {
  const header = { alg: "ES256", x5c: [LEAF_DER_B64, INT_DER_B64, ROOT_DER_B64] };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sig = crypto.sign("sha256", Buffer.from(signingInput), { key: leafKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(sig)}`;
}
const packJWS = (id = "txn-1") =>
  makeJWS({ bundleId: "com.highlightmagic.app", productId: "credits.large", type: "Consumable", transactionId: id });

function req(body: unknown): Request {
  return new Request("http://localhost/api/credits/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/credits/redeem", () => {
  beforeEach(() => {
    __resetCreditStoreForTests();
    _resetBuckets();
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    delete process.env.APP_STORE_BUNDLE_ID;
  });
  afterEach(() => {
    delete process.env.APP_STORE_ROOT_CA_PEM;
  });

  it("400s on missing userId", async () => {
    expect((await POST(req({ signedTransaction: packJWS() }))).status).toBe(400);
  });

  it("400s on missing signedTransaction", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });

  it("grants credits for a verified purchase and reports the balance", async () => {
    const res = await POST(req({ userId: "u1", signedTransaction: packJWS() }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.granted).toBe(100); // credits.large
    expect(json.balance).toBe(100);
    expect(json.duplicate).toBe(false);
    expect(await getCreditBalance("u1")).toBe(100);
  });

  it("is idempotent across HTTP calls: a replayed transaction does not double-grant", async () => {
    await POST(req({ userId: "u1", signedTransaction: packJWS("dup") }));
    const res = await POST(req({ userId: "u1", signedTransaction: packJWS("dup") }));
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(json.granted).toBe(0);
    expect(await getCreditBalance("u1")).toBe(100);
  });

  it("402s on an unverifiable / non-credit transaction", async () => {
    const res = await POST(req({ userId: "u1", signedTransaction: "garbage" }));
    expect(res.status).toBe(402);
    expect(await getCreditBalance("u1")).toBe(0);
  });
});
