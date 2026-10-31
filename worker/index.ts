import handler from "vinext/server/app-router-entry";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },
};
