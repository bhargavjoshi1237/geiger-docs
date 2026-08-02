// Migration config for @geiger/orm. This product's tables live in the dedicated
// "docs" Postgres schema of the suite-shared Supabase project, and so does
// its migration ledger (docs.geiger_migrations).
export default {
  schema: "docs",
  url: process.env.STRING_URI,
};
