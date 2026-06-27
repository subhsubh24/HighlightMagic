import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { loadTrustedRootsFromEnv, verifyAppStoreJWS } from "./app-store-jws";
import { verifyProEntitlement } from "./entitlement";

// ── Deterministic test PKI (generated with openssl, EC P-256 / ES256 — mirrors Apple's chain) ──
// Chain: leaf <- intermediate <- root. `otherRoot` is an independent, UNTRUSTED root.
const LEAF_DER_B64 =
  "MIIByjCCAXGgAwIBAgIUChJ4QNZAn7jH/7B/CBTgVE9t5owwCgYIKoZIzj0EAwIwPTEdMBsGA1UEAwwUVGVzdCBJbnRlcm1lZGlhdGUgQ0ExHDAaBgNVBAoME0hpZ2hsaWdodE1hZ2ljIFRlc3QwHhcNMjYwNjI3MTIxMDQ5WhcNMzYwNjI0MTIxMDQ5WjAyMRIwEAYDVQQDDAlUZXN0IExlYWYxHDAaBgNVBAoME0hpZ2hsaWdodE1hZ2ljIFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATdFT63pnnn8HYMPgu75a6TwZKw8EanxVm0NeSOIRzvtWxPT4aavbLD4KAbbQ2AhmTZQsA4i83UGnYoByM2ndQCo1owWDAJBgNVHRMEAjAAMAsGA1UdDwQEAwIHgDAdBgNVHQ4EFgQUk9RMsR+jC6nOXGYi+fEPFQ4zrx0wHwYDVR0jBBgwFoAUWkqleO8+DEuUbGz2FmD0HIvy3pgwCgYIKoZIzj0EAwIDRwAwRAIgLvWdy7x6gK60Phkk1Gn7U6RilN6h81Aa85gvgYltUtwCIAVYZWDhIIuGARyWdEsCV0EDeJAJBh2rWyK1UQdc3TV3";
const INT_DER_B64 =
  "MIIB0DCCAXegAwIBAgIUbkwfEM4/ivaRoPOx5/CcpwVcRmIwCgYIKoZIzj0EAwIwNTEVMBMGA1UEAwwMVGVzdCBSb290IENBMRwwGgYDVQQKDBNIaWdobGlnaHRNYWdpYyBUZXN0MB4XDTI2MDYyNzEyMTA0OVoXDTM2MDYyNDEyMTA0OVowPTEdMBsGA1UEAwwUVGVzdCBJbnRlcm1lZGlhdGUgQ0ExHDAaBgNVBAoME0hpZ2hsaWdodE1hZ2ljIFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASHiaaemIy8FQglzPZXd8LJR185Fr0YtqFSPy2aXRSOiYz61eG+4FCupdDBX4RKKGja8nwPHWPzSe0BjC1HyydRo10wWzAMBgNVHRMEBTADAQH/MAsGA1UdDwQEAwIBBjAdBgNVHQ4EFgQUWkqleO8+DEuUbGz2FmD0HIvy3pgwHwYDVR0jBBgwFoAUv/9f5P7sOAyWS2JfEkNvHhBCd/owCgYIKoZIzj0EAwIDRwAwRAIfRUJQbl+ESjIdwIaqlIQDBSSIm7ehNn0vdF5XJFayuQIhAPmWbqibEhK4PagmnXNiS8EUTqIL452dgi32S8nuyf9J";
const ROOT_DER_B64 =
  "MIIBvjCCAWWgAwIBAgIUdVKfS4ZTN7uf65iQ8/ouYU1BJDQwCgYIKoZIzj0EAwIwNTEVMBMGA1UEAwwMVGVzdCBSb290IENBMRwwGgYDVQQKDBNIaWdobGlnaHRNYWdpYyBUZXN0MB4XDTI2MDYyNzEyMTA0OVoXDTM2MDYyNDEyMTA0OVowNTEVMBMGA1UEAwwMVGVzdCBSb290IENBMRwwGgYDVQQKDBNIaWdobGlnaHRNYWdpYyBUZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhZY2CdMebwwEl3tt81EMyYSQJkRuFrPWO7GrH4u7HaAPpuHT6WVhqjm0NxAxNaWvHSHKyujFc8E6++85pEYpxaNTMFEwHQYDVR0OBBYEFL//X+T+7DgMlktiXxJDbx4QQnf6MB8GA1UdIwQYMBaAFL//X+T+7DgMlktiXxJDbx4QQnf6MA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDRwAwRAIgIL4c7SuV7AvGRQhw+mQ4YyMu6yGolBcVDjyNrcLt3e4CIAIjVhH8m9Cfyct8fGYPHlvwjsN0mm5Wn2RNy2xPsKkX";
const OTHERROOT_DER_B64 =
  "MIIBnTCCAUOgAwIBAgIUGRqccPM5VU3YzVc8ARtjqbq6qtUwCgYIKoZIzj0EAwIwJDETMBEGA1UEAwwKT3RoZXIgUm9vdDENMAsGA1UECgwERXZpbDAeFw0yNjA2MjcxMjEwNDlaFw0zNjA2MjQxMjEwNDlaMCQxEzARBgNVBAMMCk90aGVyIFJvb3QxDTALBgNVBAoMBEV2aWwwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARMjJYDXkCt/w458PhDWqC0zbm3nKwkpaDiFKrWvXH4ty2AuohVTTG4f3fhJYqQiiPGbeoHAR3fCZ3MXxEnfVqyo1MwUTAdBgNVHQ4EFgQUVqTU0MR7uNckXxN8tPuWfD3VIJMwHwYDVR0jBBgwFoAUVqTU0MR7uNckXxN8tPuWfD3VIJMwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEAvyxqkrw8nGDJWU8i3j457Wxo9H+tC8twXRRJcH/5l54CIBN5eDO7hZyln2JaxxDMy7A0NcKzz5GRxsI273x5cI/9";
const LEAF_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1FYJhx3nWf98AU4g
3/k2J1Qy2jAAI6QJ5B1XM8dNs8WhRANCAATdFT63pnnn8HYMPgu75a6TwZKw8Ean
xVm0NeSOIRzvtWxPT4aavbLD4KAbbQ2AhmTZQsA4i83UGnYoByM2ndQC
-----END PRIVATE KEY-----`;

const rootDer = Buffer.from(ROOT_DER_B64, "base64");
const otherRootDer = Buffer.from(OTHERROOT_DER_B64, "base64");
const leafKey = crypto.createPrivateKey(LEAF_KEY_PEM);

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function rootPem(der: Buffer): string {
  return `-----BEGIN CERTIFICATE-----\n${der.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----`;
}

/** Build a JWS the way StoreKit does: header(x5c) + payload + ES256(raw r||s) leaf signature. */
function makeJWS(
  payload: object,
  opts: { x5c?: string[]; alg?: string; tamper?: boolean } = {},
): string {
  const x5c = opts.x5c ?? [LEAF_DER_B64, INT_DER_B64, ROOT_DER_B64];
  const header = { alg: opts.alg ?? "ES256", x5c };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sig = crypto.sign("sha256", Buffer.from(signingInput), {
    key: leafKey,
    dsaEncoding: "ieee-p1363",
  });
  if (opts.tamper) sig[sig.length - 1] ^= 0xff;
  return `${signingInput}.${b64url(sig)}`;
}

const proPayload = {
  bundleId: "com.highlightmagic.app",
  productId: "pro.monthly",
  type: "Auto-Renewable Subscription",
  expiresDate: 4102444800000, // year 2100
};

describe("verifyAppStoreJWS (cryptographic verification)", () => {
  const trustedRootDer = [rootDer];

  it("accepts a well-formed, properly-signed, trusted-chain JWS and returns the payload", () => {
    const txn = verifyAppStoreJWS(makeJWS(proPayload), { trustedRootDer });
    expect(txn).not.toBeNull();
    expect(txn?.productId).toBe("pro.monthly");
    expect(txn?.bundleId).toBe("com.highlightmagic.app");
  });

  it("rejects a chain whose root is not trusted", () => {
    expect(verifyAppStoreJWS(makeJWS(proPayload), { trustedRootDer: [otherRootDer] })).toBeNull();
  });

  it("rejects when no trusted roots are configured", () => {
    expect(verifyAppStoreJWS(makeJWS(proPayload), { trustedRootDer: [] })).toBeNull();
  });

  it("rejects a tampered signature", () => {
    expect(verifyAppStoreJWS(makeJWS(proPayload, { tamper: true }), { trustedRootDer })).toBeNull();
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const jws = makeJWS(proPayload);
    const [h, , s] = jws.split(".");
    const forged = b64url(Buffer.from(JSON.stringify({ ...proPayload, productId: "pro.yearly" })));
    expect(verifyAppStoreJWS(`${h}.${forged}.${s}`, { trustedRootDer })).toBeNull();
  });

  it("rejects a non-ES256 algorithm", () => {
    expect(verifyAppStoreJWS(makeJWS(proPayload, { alg: "RS256" }), { trustedRootDer })).toBeNull();
  });

  it("rejects a chain that omits the root (single cert)", () => {
    expect(verifyAppStoreJWS(makeJWS(proPayload, { x5c: [LEAF_DER_B64] }), { trustedRootDer })).toBeNull();
  });

  it("rejects malformed input (wrong segment count, empty, non-string)", () => {
    expect(verifyAppStoreJWS("a.b", { trustedRootDer })).toBeNull();
    expect(verifyAppStoreJWS("", { trustedRootDer })).toBeNull();
    expect(verifyAppStoreJWS(undefined, { trustedRootDer })).toBeNull();
    expect(verifyAppStoreJWS("not-base64.@@@.###", { trustedRootDer })).toBeNull();
  });
});

describe("loadTrustedRootsFromEnv", () => {
  it("returns [] for empty/undefined env", () => {
    expect(loadTrustedRootsFromEnv(undefined)).toEqual([]);
    expect(loadTrustedRootsFromEnv("")).toEqual([]);
  });
  it("parses one or more PEM certificate blocks into DER buffers", () => {
    const single = loadTrustedRootsFromEnv(rootPem(rootDer));
    expect(single).toHaveLength(1);
    expect(Buffer.compare(single[0], rootDer)).toBe(0);
    const both = loadTrustedRootsFromEnv(`${rootPem(rootDer)}\n${rootPem(otherRootDer)}`);
    expect(both).toHaveLength(2);
  });
  it("ignores malformed blocks without throwing", () => {
    expect(loadTrustedRootsFromEnv("-----BEGIN CERTIFICATE-----\ngarbage\n-----END CERTIFICATE-----")).toEqual([]);
  });
});

describe("verifyProEntitlement (end-to-end, env-configured trusted root)", () => {
  afterEach(() => {
    delete process.env.APP_STORE_ROOT_CA_PEM;
    delete process.env.APP_STORE_BUNDLE_ID;
  });

  it("grants Pro for a verified, current Pro subscription", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    expect(await verifyProEntitlement(makeJWS(proPayload))).toBe(true);
  });

  it("denies when no trusted root is configured (secure default)", async () => {
    expect(await verifyProEntitlement(makeJWS(proPayload))).toBe(false);
  });

  it("denies a transaction signed under an untrusted root", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(otherRootDer);
    expect(await verifyProEntitlement(makeJWS(proPayload))).toBe(false);
  });

  it("denies a non-Pro productId even if validly signed", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    const jws = makeJWS({ ...proPayload, productId: "some.consumable" });
    expect(await verifyProEntitlement(jws)).toBe(false);
  });

  it("denies an expired subscription", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    const jws = makeJWS({ ...proPayload, expiresDate: Date.now() - 1000 });
    expect(await verifyProEntitlement(jws)).toBe(false);
  });

  it("denies a revoked (refunded) subscription", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    const jws = makeJWS({ ...proPayload, revocationDate: Date.now() - 1000 });
    expect(await verifyProEntitlement(jws)).toBe(false);
  });

  it("denies when the bundleId does not match the configured app", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    process.env.APP_STORE_BUNDLE_ID = "com.highlightmagic.app";
    const jws = makeJWS({ ...proPayload, bundleId: "com.someone.else" });
    expect(await verifyProEntitlement(jws)).toBe(false);
  });

  it("never trusts a client-supplied non-JWS string", async () => {
    process.env.APP_STORE_ROOT_CA_PEM = rootPem(rootDer);
    expect(await verifyProEntitlement("client-claims-pro")).toBe(false);
  });
});
