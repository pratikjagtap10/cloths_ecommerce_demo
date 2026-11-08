// Single entry point for data access. Components import `api` from here and never
// care whether data comes from JSON mocks or the real microservices.
import { USE_MOCK } from "./config";
import { httpApi } from "./httpApi";
import { mockApi } from "./mockApi";
import type { ApiClient } from "@/types";

export { ApiError } from "./mockApi";

export const api: ApiClient = USE_MOCK ? mockApi : httpApi;

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
