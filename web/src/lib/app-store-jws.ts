/**
 * App Store Server JWS verification (ROADMAP P0 / C1).
 *
 * StoreKit 2 hands the client a signed transaction (`Transaction.jwsRepresentation`): a compact
 * JWS `base64url(header).base64url(payload).base64url(signature)` whose header carries an `x5c`
 * certificate chain [leaf, intermediate, root] and whose ES256 signature is made by the leaf's
 * key. Apple signs these, so the server can verify a subscription WITHOUT any Apple secret — it
 * only needs Apple's PUBLIC root CA to anchor the chain. That makes the freemium Pro boundary
 * authoritative on the server: a tampered client cannot forge Pro because it cannot forge Apple's
 * signature.
 *
 * This module does the cryptographic verification only (chain → trusted root, validity windows,
 * ES256 signature) and returns the decoded transaction. Business checks (productId is a Pro SKU,
 * not expired, not revoked, bundleId match) live in entitlement.ts so they stay close to the gate.
 *
 * Trusted roots are supplied by the caller (see loadTrustedRootsFromEnv) — Apple's root CAs are
 * public material the owner sets in env, exactly like the API keys. No trusted root configured →
 * verification denies (the secure default).
 */
import crypto, { X509Certificate } from "node:crypto";

/** Decoded JWSTransaction / JWSRenewalInfo payload fields we care about (epoch ms where dated). */
export interface AppStoreTransaction {
  bundleId?: string;
  productId?: string;
  type?: string;
  /** Auto-renewable subscription expiry, epoch ms. Absent for non-consumables. */
  expiresDate?: number;
  /** Set (epoch ms) if Apple revoked the purchase (refund / family-sharing removal). */
  revocationDate?: number;
  signedDate?: number;
  originalTransactionId?: string;
  transactionId?: string;
}

export interface VerifyOptions {
  /** Trusted root CA certs in DER form. The JWS x5c root must byte-match one of these. */
  trustedRootDer: Buffer[];
  /** Override "now" for validity-window checks (tests). */
  now?: Date;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function certValidNow(cert: X509Certificate, now: Date): boolean {
  const from = new Date(cert.validFrom).getTime();
  const to = new Date(cert.validTo).getTime();
  const t = now.getTime();
  return Number.isFinite(from) && Number.isFinite(to) && t >= from && t <= to;
}

/**
 * Parse trusted root CA certificate(s) from a PEM string (may contain several concatenated
 * `-----BEGIN CERTIFICATE-----` blocks). Returns their DER bytes. Defaults to the
 * APP_STORE_ROOT_CA_PEM env var (owner-supplied: Apple's public root CA, e.g. Apple Root CA - G3
 * from https://www.apple.com/certificateauthority/). Returns [] when unset or unparseable.
 */
export function loadTrustedRootsFromEnv(
  pem: string | undefined = process.env.APP_STORE_ROOT_CA_PEM,
): Buffer[] {
  if (!pem) return [];
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks) return [];
  const out: Buffer[] = [];
  for (const block of blocks) {
    try {
      out.push(Buffer.from(new X509Certificate(block).raw));
    } catch {
      // skip malformed block — never throw from a security helper
    }
  }
  return out;
}

/**
 * Verify an App Store Server JWS and return its decoded payload, or null if verification fails
 * for ANY reason (malformed input, untrusted chain, expired cert, bad signature). Never throws —
 * a verification failure must fail closed, never crash the gate.
 */
export function verifyAppStoreJWS(jws: unknown, opts: VerifyOptions): AppStoreTransaction | null {
  try {
    if (typeof jws !== "string" || jws.length === 0) return null;
    if (!opts.trustedRootDer || opts.trustedRootDer.length === 0) return null;
    const now = opts.now ?? new Date();

    const parts = jws.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(b64urlToBuf(parts[0]).toString("utf8")) as {
      alg?: string;
      x5c?: unknown;
    };
    if (header.alg !== "ES256") return null;
    if (!Array.isArray(header.x5c) || header.x5c.length < 2) return null;

    // x5c entries are base64 (standard, not url) DER certificates, leaf-first.
    const certs: X509Certificate[] = [];
    for (const entry of header.x5c) {
      if (typeof entry !== "string") return null;
      certs.push(new X509Certificate(Buffer.from(entry, "base64")));
    }

    // Every cert must be inside its validity window.
    for (const c of certs) if (!certValidNow(c, now)) return null;

    // The chain root (last cert) must byte-match a trusted root.
    const root = certs[certs.length - 1];
    const rootTrusted = opts.trustedRootDer.some(
      (der) => Buffer.compare(der, Buffer.from(root.raw)) === 0,
    );
    if (!rootTrusted) return null;

    // Each cert must be signed by the next one up; the root must be self-signed.
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) return null;
    }
    if (!root.verify(root.publicKey)) return null;

    // Verify the JWS signature (ES256 → raw r||s) over `header.payload` with the leaf key.
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = b64urlToBuf(parts[2]);
    const signatureOk = crypto.verify(
      "sha256",
      Buffer.from(signingInput),
      { key: certs[0].publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
    if (!signatureOk) return null;

    return JSON.parse(b64urlToBuf(parts[1]).toString("utf8")) as AppStoreTransaction;
  } catch {
    return null;
  }
}
