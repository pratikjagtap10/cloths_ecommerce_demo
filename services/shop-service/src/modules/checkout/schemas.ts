// Shipping address validation (422 with "<Field>: <message>", e.g.
// "Phone: Enter a valid 10-digit mobile number"). Same rules as the frontend form.
import { REQUIRED, requiredString } from "@threads/shared";
import { z } from "zod";

export const addressSchema = z.object(
  {
    full_name: requiredString(150),
    phone: z
      .string({ required_error: REQUIRED, invalid_type_error: "Must be a string." })
      .trim()
      .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
    line1: requiredString(255),
    city: requiredString(100),
    state: requiredString(100),
    postal_code: z
      .string({ required_error: REQUIRED, invalid_type_error: "Must be a string." })
      .trim()
      .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  },
  { required_error: REQUIRED, invalid_type_error: "Must be an object." },
);

export const checkoutSchema = z.object({ address: addressSchema });
