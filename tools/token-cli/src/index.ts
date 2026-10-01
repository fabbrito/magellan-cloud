import { isTokenKind, mintStatement, revokeStatement } from "@magellan/token";

// Prints the SQL that changes the token registry — minting prints the token once beside it. It
// never talks to Cloudflare: scripts/ run what it prints against the live store.
const usage = `usage:
  bun tools/token-cli/src/index.ts mint [--plain] <device|client> <id> <description>
  bun tools/token-cli/src/index.ts revoke <device|client> <id>`;

function refuse(problem: string): never {
  console.error(`${problem}\n\n${usage}`);
  process.exit(1);
}

async function mint(commandArguments: string[]): Promise<void> {
  const plain = commandArguments[0] === "--plain";
  const [kind, id, description, ...rest] = plain ? commandArguments.slice(1) : commandArguments;
  if (rest.length > 0) refuse("Too many arguments; quote a description with spaces.");
  if (!isTokenKind(kind)) refuse("A kind is device or client.");

  const minted = await mintStatement(kind, id ?? "", description ?? "", Date.now());
  if (!minted.ok) refuse(minted.problem);

  if (plain) {
    console.log(`${minted.token}\n${minted.statement}`);
  } else {
    console.log(`token, shown once — store it now:\n\n  ${minted.token}\n`);
    console.log(`register it in the local store:\n`);
    console.log(`  bun run dev:exec --command "${minted.statement}"\n`);
  }
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
