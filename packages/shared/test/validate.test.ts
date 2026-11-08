import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "../src/errors";
import { fieldLabel, parse, requiredString } from "../src/validate";
import { signToken, verifyToken, TokenError } from "../src/auth";
import { intParam } from "../src/http";

describe("validation errors", () => {
  it("labels fields in human form", () => {
    expect(fieldLabel("postal_code")).toBe("Postal code");
    expect(fieldLabel("phone")).toBe("Phone");
  });

  it("formats the first problem as '<Field>: <message>' with the given status", () => {
    const schema = z.object({ address: z.object({ phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number") }) });
    try {
      parse(schema, { address: { phone: "123" } }, 422);
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).detail).toBe("Phone: Enter a valid 10-digit mobile number");
      expect((e as ApiError).errors).toEqual({ "address.phone": ["Enter a valid 10-digit mobile number"] });
    }
  });

  it("reports missing required fields", () => {
    expect(() => parse(z.object({ city: requiredString(50) }), {})).toThrow("City: This field is required.");
  });
});

describe("JWT", () => {
  const settings = { secret: "x".repeat(40), accessMinutes: 30, refreshDays: 7 };
  const user = { id: 7, email: "a@b.com", firstName: "Ann" };

  it("round-trips the claims", () => {
    const claims = verifyToken(signToken("access", user, settings), settings.secret, "access");
    expect(claims).toMatchObject({ user_id: "7", token_type: "access", email: "a@b.com", first_name: "Ann" });
    expect(claims.jti).toBeTypeOf("string");
  });

  it("rejects a refresh token used as an access token", () => {
    const refresh = signToken("refresh", user, settings);
    expect(() => verifyToken(refresh, settings.secret, "access")).toThrow(TokenError);
  });
});

describe("intParam", () => {
  it("accepts positive integers and rejects anything else with 404", () => {
    expect(intParam("42")).toBe(42);
    for (const bad of ["0", "-1", "abc", "1.5", ""]) expect(() => intParam(bad)).toThrow(ApiError);
  });
});
