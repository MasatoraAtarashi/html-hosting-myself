import { Hono } from "hono";
import type { AppEnv } from "../env";
import { writeAuth } from "../middleware/access-auth";
import { errorHandler } from "../middleware/error-handler";
import { requestId } from "../middleware/request-id";
import { hostsRoute } from "./routes/hosts";
import { uploadRoute } from "./routes/upload";

export const api = new Hono<AppEnv>()
  .use("*", requestId)
  .use("*", writeAuth)
  .route("/hosts", hostsRoute)
  .route("/upload", uploadRoute)
  .onError(errorHandler);
