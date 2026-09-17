import { createApp } from "../server/app";
import { purgeExpiredHosts } from "../server/hosting/cleanup";

const app = createApp();

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(purgeExpiredHosts(env));
  },
};
