import { hashToken, isTokenKind, mintStatement, mintToken, revokeStatement } from "@magellan/token";

// Prints the SQL that changes the token registry — minting prints the token once beside it. It
// never talks to Cloudflare: the statement runs locally through dev:exec, or by the maintainer's
// hand in the live D1's console, the way back in should the admin token be lost.
const usage = `usage:
  bun tools/token-cli/src/index.ts mint admin
  bun tools/token-cli/src/index.ts mint <device|client> <id> <description>
  bun tools/token-cli/src/index.ts revoke <device|client> <id>`;

function refuse(problem: string): never {
  console.error(`${problem}\n\n${usage}`);
  process.exit(1);
}

// The admin token has no row: its hash is a secret the deploy ships to the admin worker.
async function mintAdmin(rest: string[]): Promise<void> {
  if (rest.length > 0) refuse("Too many arguments; the admin token has no id.");

  const token = mintToken();
  console.log(`token, shown once — store it now:\n\n  ${token}\n`);
  console.log(`its hash, the ADMIN_TOKEN_HASH secret — production's, or .dev.vars locally:\n`);
  console.log(`  ${await hashToken(token)}\n`);
}

async function mint(commandArguments: string[]): Promise<void> {
  const [kind, id, description, ...rest] = commandArguments;
  if (kind === "admin") return mintAdmin(commandArguments.slice(1));
  if (rest.length > 0) refuse("Too many arguments; quote a description with spaces.");
  if (!isTokenKind(kind)) refuse("A kind is device or client.");

  const minted = await mintStatement(kind, id ?? "", description ?? "", Date.now());
  if (!minted.ok) refuse(minted.problem);

  console.log(`token, shown once — store it now:\n\n  ${minted.token}\n`);
  console.log(`register it in the local store:\n`);
  console.log(`  bun run dev:exec --command "${minted.statement}"\n`);
  console.log(`or in the live D1, through its console:\n\n  ${minted.statement}\n`);
}

function revoke(commandArguments: string[]): void {
  const [kind, id, ...rest] = commandArguments;
  if (rest.length > 0) refuse("Too many arguments.");
  if (!isTokenKind(kind)) refuse("A kind is device or client.");

  const revoked = revokeStatement(kind, id ?? "", Date.now());
  if (!revoked.ok) refuse(revoked.problem);
  console.log(revoked.statement);
}

const [command, ...commandArguments] = process.argv.slice(2);
if (command === "mint") await mint(commandArguments);
else if (command === "revoke") revoke(commandArguments);
else refuse(`No such command: ${command ?? "(none)"}.`);
