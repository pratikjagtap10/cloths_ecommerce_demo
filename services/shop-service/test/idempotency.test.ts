import { describe, expect, it } from "vitest";
import { ApiError } from "@threads/shared";
import { readKey, requestFingerprint, shouldRemember } from "../src/lib/idempotencyKey";

describe("Idempotency-Key header", () => {
  it("is optional", () => {
    expect(readKey(undefined)).toBeNull();
    expect(readKey("  ")).toBeNull();
  });

  it("accepts UUIDs and similar keys", () => {
    expect(readKey("2f1c8f4e-1b7a-4c55-9a0e-1234567890ab")).toBe("2f1c8f4e-1b7a-4c55-9a0e-1234567890ab");
    expect(readKey(" payment-12-success ")).toBe("payment-12-success");
  });

  it("rejects too short, too long or unsafe keys with 400", () => {
    for (const bad of ["short", "x".repeat(101), "has space here", "semi;colon-key"]) {
      expect(() => readKey(bad)).toThrow(ApiError);
    }
  });
});

describe("request fingerprint", () => {
  const body = { address: { phone: "9876543210", city: "Pune" } };

  it("is the same for the same endpoint and body", () => {
    expect(requestFingerprint("POST /api/shop/checkout", body)).toBe(
      requestFingerprint("POST /api/shop/checkout", structuredClone(body)),
    );
  });

  it("differs when the body or endpoint differs", () => {
    const base = requestFingerprint("POST /api/shop/checkout", body);
    expect(requestFingerprint("POST /api/shop/checkout", { address: { phone: "9876543211", city: "Pune" } })).not.toBe(base);
    expect(requestFingerprint("POST /api/shop/payments/1/confirm", body)).not.toBe(base);
  });
});

describe("which outcomes are replayed", () => {
  it("remembers successes and business conflicts", () => {
    expect(shouldRemember(200)).toBe(true);
    expect(shouldRemember(201)).toBe(true);
    expect(shouldRemember(409)).toBe(true);
  });

  it("forgets validation, auth and server errors so the client can retry", () => {
    for (const status of [400, 401, 404, 422, 500, 503]) expect(shouldRemember(status)).toBe(false);
  });
});
