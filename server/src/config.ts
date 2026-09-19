import { z } from "zod";

const optionalSecret = z
  .string()
  .max(500)
  .optional()
  .transform((v) => {
    const t = v?.trim() ?? "";
    return t.length > 0 ? t : undefined;
  });

function defaultClientOrigin(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = env["CLIENT_ORIGIN"]?.trim();
  if (explicit) return explicit;
  const production = env["VERCEL_PROJECT_PRODUCTION_URL"]?.trim();
  if (env["VERCEL_ENV"] === "production" && production) {
    return `https://${production.replace(/^https?:\/\//, "")}`;
  }
  const deployment = env["VERCEL_URL"]?.trim();
  if (deployment) return `https://${deployment.replace(/^https?:\/\//, "")}`;
  return undefined;
}

function upstashUrl(env: NodeJS.ProcessEnv): string | undefined {
  return optionalSecret.parse(env["UPSTASH_REDIS_REST_URL"] ?? env["KV_REST_API_URL"]);
}

function upstashToken(env: NodeJS.ProcessEnv): string | undefined {
  return optionalSecret.parse(env["UPSTASH_REDIS_REST_TOKEN"] ?? env["KV_REST_API_TOKEN"]);
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CLIENT_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1).max(500),
  SESSION_SECRET: z.string().min(16).max(200),
  TICKET_SIGNING_SECRET: z.string().min(16).max(200),
  COOKIE_SECURE: z.boolean(),
  UPSTASH_REDIS_REST_URL: z.string().url().max(500).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(8).max(500).optional(),
  STAFF_EMAIL: z.string().email().max(255).optional(),
  STAFF_PASSWORD: z.string().min(10).max(200).optional(),
  STAFF_PHONE: z.string().min(10).max(16).optional(),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_REDIRECT_URI: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  MPESA_MODE: z.enum(["mock", "live"]).default("mock"),
  MPESA_CONSUMER_KEY: z.string().max(200).optional(),
  MPESA_CONSUMER_SECRET: z.string().max(200).optional(),
  MPESA_SHORTCODE: z.string().max(20).optional(),
  MPESA_PASSKEY: z.string().max(200).optional(),
  MPESA_CALLBACK_URL: z.string().url().optional(),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === "production") {
    if (!data.UPSTASH_REDIS_REST_URL || !data.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["UPSTASH_REDIS_REST_URL"],
        message: "Upstash Redis REST URL and token are required in production",
      });
    }
  }
  if (data.MPESA_MODE !== "live") return;
  const required: Array<[string, string | undefined]> = [
    ["MPESA_CONSUMER_KEY", data.MPESA_CONSUMER_KEY],
    ["MPESA_CONSUMER_SECRET", data.MPESA_CONSUMER_SECRET],
    ["MPESA_SHORTCODE", data.MPESA_SHORTCODE],
    ["MPESA_PASSKEY", data.MPESA_PASSKEY],
    ["MPESA_CALLBACK_URL", data.MPESA_CALLBACK_URL],
  ];
  for (const [key, value] of required) {
    if (!value) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "required when MPESA_MODE=live",
      });
    }
  }
  if (data.MPESA_CALLBACK_URL && !data.MPESA_CALLBACK_URL.startsWith("https://")) {
    ctx.addIssue({
      code: "custom",
      path: ["MPESA_CALLBACK_URL"],
      message: "must be https for live Daraja callbacks",
    });
  }
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cookieRaw = env["COOKIE_SECURE"]?.trim();
  const cookieSecure =
    cookieRaw === "true" || cookieRaw === "false"
      ? cookieRaw === "true"
      : env["NODE_ENV"] === "production" || Boolean(env["VERCEL"]);
  const parsed = EnvSchema.safeParse({
    ...env,
    CLIENT_ORIGIN: defaultClientOrigin(env),
    COOKIE_SECURE: cookieSecure,
    UPSTASH_REDIS_REST_URL: upstashUrl(env),
    UPSTASH_REDIS_REST_TOKEN: upstashToken(env),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

export function googleOAuthConfig(
  config: Config,
):
  | { clientId: string; clientSecret: string; redirectUri: string }
  | undefined {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return undefined;
  }
  return {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri:
      config.GOOGLE_REDIRECT_URI ??
      `${config.CLIENT_ORIGIN}/v1/auth/google/callback`,
  };
}
