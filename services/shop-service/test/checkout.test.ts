import { describe, expect, it } from "vitest";
import { ApiError, parse } from "@threads/shared";
import { checkoutSchema } from "../src/modules/checkout/schemas";

const address = {
  full_name: "Demo User",
  phone: "9876543210",
  line1: "12 MG Road",
  city: "Pune",
  state: "Maharashtra",
  postal_code: "411001",
};

describe("checkout address validation", () => {
  it("accepts a valid address", () => {
    expect(parse(checkoutSchema, { address }, 422).address).toEqual(address);
  });

  it("returns 422 with the exact message the frontend and Postman expect", () => {
    try {
      parse(checkoutSchema, { address: { ...address, phone: "12345" } }, 422);
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).detail).toBe("Phone: Enter a valid 10-digit mobile number");
    }
  });

  it("requires the address object and its fields", () => {
    expect(() => parse(checkoutSchema, {}, 422)).toThrow("Address: This field is required.");
    expect(() => parse(checkoutSchema, { address: { ...address, city: " " } }, 422)).toThrow("City: This field is required.");
    expect(() => parse(checkoutSchema, { address: { ...address, postal_code: "4110" } }, 422)).toThrow("PIN code");
  });
});
