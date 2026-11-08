import { describe, expect, it } from "vitest";
import { ApiError } from "@threads/shared";
import { passwordProblem } from "../src/modules/auth/passwordRules";
import { buildProductQuery } from "../src/modules/catalog/filters";
import { shippingFor } from "../src/modules/orders/shipping";

const user = { email: "rahul.sharma@example.com", first_name: "Rahul", last_name: "Sharma" };

describe("password rules", () => {
  it("accepts a strong password", () => {
    expect(passwordProblem("Str0ng-Passw0rd!", user)).toBeNull();
  });
  it.each([
    ["short1", "too short"],
    ["password123", "too common"],
    ["98127345612", "entirely numeric"],
    ["rahulsharma99", "too similar"],
  ])("rejects %s (%s)", (pw, reason) => {
    expect(passwordProblem(pw, user)).toContain(reason);
  });
});

describe("shipping", () => {
  it("is free from 1999 and 99 below", () => {
    expect(shippingFor(1999)).toBe(0);
    expect(shippingFor(2500)).toBe(0);
    expect(shippingFor(1998)).toBe(99);
  });
});

describe("product query builder", () => {
  const build = (q: Record<string, string>) => buildProductQuery((k) => q[k] ?? "");

  it("defaults to newest first, page 1, active products only, ties broken by id", () => {
    const { where, orderBy, page } = build({});
    expect(page).toBe(1);
    expect(orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
    expect(where).toEqual({ AND: [{ isActive: true }] });
  });

  it("maps the price ordering alias to base_price", () => {
    expect(build({ ordering: "-price" }).orderBy[0]).toEqual({ basePrice: "desc" });
  });

  it("matches parent and child categories", () => {
    const { where } = build({ category: "men" });
    expect(where.AND).toContainEqual({
      OR: [{ category: { slug: "men" } }, { category: { parent: { slug: "men" } } }],
    });
  });

  it("applies size and colour to the same variant, colour case-insensitive", () => {
    const { where } = build({ size: "M", color: "black" });
    expect(where.AND).toContainEqual({
      variants: { some: { size: "M", color: { equals: "black", mode: "insensitive" } } },
    });
  });

  it("rejects bad numbers and pages", () => {
    expect(() => build({ min_price: "abc" })).toThrow("Min price: Enter a valid number.");
    expect(() => build({ page: "0" })).toThrow(ApiError);
  });
});
