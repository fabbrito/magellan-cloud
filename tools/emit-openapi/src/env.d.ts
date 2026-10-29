// The admin worker's secret, which ingest's declarations do not carry: a second generated file
// would declare the runtime twice, so the one binding merges in here.
interface Env {
  ADMIN_TOKEN_HASH: string;
}
