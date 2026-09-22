import { deviceIdPattern, hashToken, mintToken } from "@magellan/shared";

// Prints a token once and the statement that registers its hash. It never talks to Cloudflare:
// running the statement is the maintainer's, here and on --remote alike (AGENTS.md).
const descriptionLengthMax = 64;

// The description reaches a shell command and a SQL string literal, so quotes and backslashes are
// out rather than escaped — this is a one-off command a person reads before running it.
const descriptionPattern = new RegExp(`^[A-Za-z0-9 ._:()/-]{1,${descriptionLengthMax}}$`);

function refuse(problem: string): never {
  console.error(
    `${problem}\n\nusage: bun run --filter @magellan/mint-token mint <id> <description>`,
  );
  process.exit(1);
}

const [deviceId, description] = process.argv.slice(2);
if (deviceId === undefined || !deviceIdPattern.test(deviceId)) {
  refuse("An id is lowercase letters, digits and dashes, starting with a letter or digit.");
}
if (description === undefined || !descriptionPattern.test(description)) {
  refuse(`A description is 1 to ${descriptionLengthMax} characters, no quotes or backslashes.`);
}

const token = mintToken();
const tokenHash = await hashToken(token);
const statement =
  `INSERT INTO devices (id, description, token_hash, created_at) ` +
  `VALUES ('${deviceId}', '${description}', '${tokenHash}', ${Date.now()})`;

console.log(`token, shown once — store it now:\n\n  ${token}\n`);
console.log(`register it with --local, or --remote when the device is real:\n`);
console.log(`  bunx wrangler d1 execute DB --local --command "${statement}"\n`);
