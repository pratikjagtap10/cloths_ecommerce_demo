// Zod validation -> readable API errors.
// The first problem becomes the "detail" message in "<Field label>: <message>" form,
// e.g. {"detail": "Phone: Enter a valid 10-digit mobile number"}, which the frontend
// shows as-is. All problems are listed in "errors".
import { z, type ZodError, type ZodTypeAny } from "zod";
import { ApiError } from "./errors";

export const REQUIRED = "This field is required.";

/** "postal_code" -> "Postal code" */
export function fieldLabel(key: string | number): string {
  const text = String(key).replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatZodError(error: ZodError): { detail: string; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length ? issue.path.join(".") : "non_field_errors";
    (errors[field] ??= []).push(issue.message);
  }
  const first = error.issues[0];
  // Use the last named (non-index) path segment as label: items.0.quantity -> "Quantity"
  const key = [...(first?.path ?? [])].reverse().find((p) => typeof p === "string");
  const detail = key !== undefined ? `${fieldLabel(key)}: ${first.message}` : (first?.message ?? "Invalid data.");
  return { detail, errors };
}

/** Parse `data` with `schema` or throw an ApiError (400 by default, 422 for the shop service). */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown, status = 400): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const { detail, errors } = formatZodError(result.error);
    throw new ApiError(status, detail, errors);
  }
  return result.data;
}

/** Required, trimmed, non-empty string with a max length */
export const requiredString = (max: number) =>
  z
    .string({ required_error: REQUIRED, invalid_type_error: "Must be a string." })
    .trim()
    .min(1, REQUIRED)
    .max(max, `Ensure this field has no more than ${max} characters.`);

/** Validate process.env at startup; print every problem and exit if anything is missing. */
export function loadConfig<S extends ZodTypeAny>(schema: S, env: NodeJS.ProcessEnv = process.env): z.infer<S> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${lines.join("\n")}`);
    process.exit(1);
  }
  return result.data;
}
