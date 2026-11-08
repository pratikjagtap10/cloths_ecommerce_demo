// Every error response has the same shape the frontend and Postman expect:
//   { "detail": "Human readable message", "errors"?: { field: [messages] } }
import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

export const notFound = (detail = "Not found.") => new ApiError(404, detail);

/** Unknown route -> 404 JSON instead of Express' HTML page */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ detail: "Not found." });
};

/** Last middleware: converts any thrown error into {"detail": "..."} */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof ApiError) {
      res.status(err.status).json(err.errors ? { detail: err.detail, errors: err.errors } : { detail: err.detail });
      return;
    }
    // Errors raised by express.json()
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ detail: "Invalid JSON body." });
      return;
    }
    if (err?.type === "entity.too.large") {
      res.status(413).json({ detail: "Request body is too large." });
      return;
    }
    (req.log ?? logger).error({ err }, "unhandled error");
    res.status(500).json({ detail: "Internal server error." });
  };
}
