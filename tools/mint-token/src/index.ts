import { hashToken, idPattern, mintToken } from "@magellan/shared";

// Prints a token once and the statement that registers its hash — a device's, or with `--client` a
// read API client's. It never talks to Cloudflare.
const descriptionLengthMax = 64;

// The description reaches a shell command and a SQL string literal, so quotes and backslashes are
// out rather than escaped — this is a one-off command a person reads before running it.
const descriptionPattern = new RegExp(`^[A-Za-z0-9 ._:()/-]{1,${descriptionLengthMax}}$`);

const flags = ["--plain", "--client"];

function refuse(problem: string): never {
  console.error(`${problem}\n\nusage: bun run mint [--plain] [--client] <id> <description>`);
  process.exit(1);
}

const commandArguments = process.argv.slice(2);
const flagCount = commandArguments.findIndex((each) => !flags.includes(each));
const given = commandArguments.slice(0, flagCount === -1 ? commandArguments.length : flagCount);
const [id, description, ...rest] = commandArguments.slice(given.length);
const plain = given.includes("--plain");
const table = given.includes("--client") ? "api_clients" : "devices";

if (rest.length > 0) refuse("Too many arguments; quote a description with spaces.");
if (id === undefined || !idPattern.test(id)) {
  refuse("An id is lowercase letters, digits and dashes, starting with a letter or digit.");
}
if (description === undefined || !descriptionPattern.test(description)) {
  refuse(`A description is 1 to ${descriptionLengthMax} characters, no quotes or backslashes.`);
}

const token = mintToken();
const tokenHash = await hashToken(token);
const statement =
  `INSERT INTO ${table} (id, description, token_hash, created_at) ` +
  `VALUES ('${id}', '${description}', '${tokenHash}', ${Date.now()})`;

if (plain) {
  console.log(`${token}\n${statement}`);
} else {
  console.log(`token, shown once — store it now:\n\n  ${token}\n`);
  console.log(`register it in the local store:\n`);
  console.log(`  bun run dev:exec --command "${statement}"\n`);
}
