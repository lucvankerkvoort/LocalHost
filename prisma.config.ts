import "dotenv/config";
import { execSync } from "node:child_process";
import { defineConfig } from "prisma/config";

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function sanitizeIdentifier(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!cleaned) return "default";
  if (/^[0-9]/.test(cleaned)) return `b_${cleaned}`;
  return cleaned;
}

function truncateIdentifier(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function resolveGitBranchName(): string | null {
  try {
    const output = execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .trim();
    if (!output || output === "HEAD") return null;
    return output;
  } catch {
    return null;
  }
}

function resolveSchemaName(enableBranchIsolation: boolean): string | null {
  const explicitSchema = process.env.PRISMA_DB_SCHEMA?.trim();
  if (explicitSchema) {
    return truncateIdentifier(sanitizeIdentifier(explicitSchema), 63);
  }

  if (!enableBranchIsolation) return null;

  const prefix = sanitizeIdentifier(
    process.env.PRISMA_DB_SCHEMA_PREFIX?.trim() || "branch"
  );
  const branchSource =
    process.env.PRISMA_DB_BRANCH?.trim() || resolveGitBranchName() || "local";
  const branch = sanitizeIdentifier(branchSource);
  return truncateIdentifier(`${prefix}_${branch}`, 63);
}

function withSchema(urlValue: string, schemaName: string): string {
  const parsed = new URL(urlValue);
  parsed.searchParams.set("schema", schemaName);
  return parsed.toString();
}

const enableBranchIsolation = isTruthy(process.env.PRISMA_BRANCH_ISOLATION);
const baseDatabaseUrl =
  process.env.PRISMA_DEV_DATABASE_URL?.trim() || process.env.DATABASE_URL;
const schemaName = resolveSchemaName(enableBranchIsolation);
const effectiveDatabaseUrl =
  baseDatabaseUrl && schemaName ? withSchema(baseDatabaseUrl, schemaName) : baseDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: effectiveDatabaseUrl,
  },
});
