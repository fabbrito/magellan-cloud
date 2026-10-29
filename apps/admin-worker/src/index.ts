import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getDb } from "@magellan/db";
import { problemSchema } from "@magellan/query";
import {
  idSchema,
  listTokens,
  mintedSchema,
  registerToken,
  registrationSchema,
  revokeToken,
  tokenRowSchema,
  type TokenKind,
} from "@magellan/token";
import { bodyLimit } from "hono/body-limit";

import { isAdminToken } from "./admin.ts";
import { detailOf, problem } from "./problem.ts";

// Maintainer-facing: mints and revokes device and client tokens. The admin token is the authority
// on every route, and nothing else is.
//
// Versioned: the path is what the maintainer's infra repository keeps.
const app = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: (result, context) => {
    if (!result.success) {
      return problem(context, 400, "Malformed request", {
        detail: detailOf(result.error, result.target),
      });
    }
    return undefined;
  },
});

// First, before any body is read: a caller without the admin token learns nothing.
app.use(async (context, next) => {
  const header = context.req.header("authorization");
  if (!(await isAdminToken(header, context.env.ADMIN_TOKEN_HASH))) {
    context.header("www-authenticate", "Bearer");
    return problem(context, 401, "Unauthorized");
  }
  await next();
});

// A registration is an id and a description, each bounded far below this.
const bodyBytesMax = 1024;

app.use(
  bodyLimit({
    maxSize: bodyBytesMax,
    onError: (context) => problem(context, 413, "Body too large"),
  }),
);

app.openAPIRegistry.registerComponent("securitySchemes", "adminToken", {
  type: "http",
  scheme: "bearer",
});

const problemContent = { "application/problem+json": { schema: problemSchema } };
const unauthorized = { description: "No admin token, or another.", content: problemContent };
const malformed = { description: "Malformed request.", content: problemContent };

// The path each kind is served under: the one place a kind becomes a collection.
const collections = { device: "devices", client: "clients" } satisfies Record<TokenKind, string>;

// The same three routes for each kind: the kind names the collection, and nothing else differs.
function mount(kind: TokenKind): void {
  const collection = collections[kind];
  app.openapi(
    createRoute({
      method: "get",
      path: `/v1/${collection}`,
      responses: {
        200: {
          description: `Every ${kind}, revoked ones too, by id.`,
          content: { "application/json": { schema: z.array(tokenRowSchema) } },
        },
        401: unauthorized,
      },
    }),
    async (context) => context.json(await listTokens(getDb(context.env.DB), kind), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `/v1/${collection}`,
      request: {
        body: { required: true, content: { "application/json": { schema: registrationSchema } } },
      },
      responses: {
        201: {
          description: `The ${kind}'s token, shown once.`,
          content: { "application/json": { schema: mintedSchema } },
        },
        400: malformed,
        401: unauthorized,
        409: { description: "The id is taken, revoked or not.", content: problemContent },
        413: { description: "Body too large.", content: problemContent },
      },
    }),
    async (context) => {
      const registration = context.req.valid("json");
      const db = getDb(context.env.DB);
      const token = await registerToken(db, kind, registration, Date.now());
      if (token === undefined) return problem(context, 409, "Id taken");
      // The token lives in this body alone, so nothing between here and the caller keeps a copy.
      context.header("cache-control", "no-store");
      return context.json({ id: registration.id, token }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `/v1/${collection}/{id}/revoke`,
      request: { params: z.object({ id: idSchema }) },
      responses: {
        204: { description: "Revoked, now or already." },
        400: malformed,
        401: unauthorized,
        404: { description: `No such ${kind}.`, content: problemContent },
      },
    }),
    async (context) => {
      const { id } = context.req.valid("param");
      if (!(await revokeToken(getDb(context.env.DB), kind, id, Date.now()))) {
        return problem(context, 404, `No such ${kind}`);
      }
      return context.body(null, 204);
    },
  );
}

mount("device");
mount("client");

app.notFound((context) => problem(context, 404, "No such route"));

// A fault here, not the caller's: logged for the tail, answered without its message.
app.onError((error, context) => {
  console.error(error);
  return problem(context, 500, "Internal error");
});

export default app;
