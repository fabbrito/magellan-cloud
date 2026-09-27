import { hashToken, idPattern, mintToken } from "@magellan/token";

// Prints the SQL that changes the token registry — minting prints the token once beside it. It
// never talks to Cloudflare: scripts/ run what it prints against the live store.
const usage = `usage:
  bun tools/token/src/index.ts mint [--plain] <device|client> <id> <description>
  bun tools/token/src/index.ts revoke <device|client> <id>`;

// The one place a kind becomes a table.
const tables = { device: "devices", client: "api_clients" } as const;
type Kind = keyof typeof tables;

const descriptionLengthMax = 64;

// The description reaches a shell command and a SQL string literal, so quotes and backslashes are
// out rather than escaped — this is a one-off command a person reads before running it.
const descriptionPattern = new RegExp(`^[A-Za-z0-9 ._:()/-]{1,${descriptionLengthMax}}$`);

function refuse(problem: string): never {
  console.error(`${problem}\n\n${usage}`);
  process.exit(1);
}

function isKind(word: string | undefined): word is Kind {
  return word !== undefined && Object.hasOwn(tables, word);
}

// The id reaches a SQL string literal unescaped; the pattern is what makes that safe.
function checkedId(id: string | undefined): string {
  if (id === undefined || !idPattern.test(id)) {
    refuse("An id is lowercase letters, digits and dashes, starting with a letter or digit.");
  }
  return id;
}

async function mint(commandArguments: string[]): Promise<void> {
  const plain = commandArguments[0] === "--plain";
  const [kind, id, description, ...rest] = plain ? commandArguments.slice(1) : commandArguments;
  if (rest.length > 0) refuse("Too many arguments; quote a description with spaces.");
  if (!isKind(kind)) refuse("A kind is device or client.");
  const checked = checkedId(id);
  if (description === undefined || !descriptionPattern.test(description)) {
    refuse(`A description is 1 to ${descriptionLengthMax} characters, no quotes or backslashes.`);
  }

  const token = mintToken();
  const statement =
    `INSERT INTO ${tables[kind]} (id, description, token_hash, created_at) ` +
    `VALUES ('${checked}', '${description}', '${await hashToken(token)}', ${Date.now()})`;

  if (plain) {
    console.log(`${token}\n${statement}`);
  } else {
    console.log(`token, shown once — store it now:\n\n  ${token}\n`);
    console.log(`register it in the local store:\n`);
    console.log(`  bun run dev:exec --command "${statement}"\n`);
  }
}

// Revoked, never deleted: the row keeps what the token wrote or read attributed.
function revoke(commandArguments: string[]): void {
  const [kind, id, ...rest] = commandArguments;
  if (rest.length > 0) refuse("Too many arguments.");
  if (!isKind(kind)) refuse("A kind is device or client.");
  console.log(
    `UPDATE ${tables[kind]} SET revoked_at = ${Date.now()} ` +
      `WHERE id = '${checkedId(id)}' AND revoked_at IS NULL`,
  );
}

const [command, ...commandArguments] = process.argv.slice(2);
if (command === "mint") await mint(commandArguments);
else if (command === "revoke") revoke(commandArguments);
else refuse(`No such command: ${command ?? "(none)"}.`);
