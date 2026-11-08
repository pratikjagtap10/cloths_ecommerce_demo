import { REQUIRED } from "@threads/shared";
import { z } from "zod";

const email = z
  .string({ required_error: REQUIRED, invalid_type_error: "Must be a string." })
  .trim()
  .toLowerCase()
  .min(1, REQUIRED)
  .max(254, "Ensure this field has no more than 254 characters.")
  .email("Enter a valid email address.");

const password = z
  .string({ required_error: REQUIRED, invalid_type_error: "Must be a string." })
  .min(1, REQUIRED)
  .max(128, "Ensure this field has no more than 128 characters.");

const name = z.string({ invalid_type_error: "Must be a string." }).trim().max(150).default("");

export const registerSchema = z.object({ email, password, first_name: name, last_name: name });
export const loginSchema = z.object({ email, password });
export const refreshSchema = z.object({
  refresh: z.string({ required_error: REQUIRED, invalid_type_error: "Must be a string." }).min(1, REQUIRED),
});
