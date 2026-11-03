const { readMetabloomSavedWorkConfig, createMetabloomSavedWorkPool } = require('../server/metabloomSavedWorkDatabase');
const { migrateMetabloomSavedWork } = require('../server/metabloomSavedWorkMigrations');

async function main(args = process.argv.slice(2), env = process.env) {
  const target = args.find(value => /^--environment=(production|preview|development)$/.test(value));
  if (args.length !== 2 || !args.includes('--apply') || !target)
    throw Object.assign(new Error('Use --apply --environment=production|preview|development'), { code: 'migration_arguments_required' });
  const config = readMetabloomSavedWorkConfig(env, { migration: true });
  if (target.slice('--environment='.length) !== config.environment)
    throw Object.assign(new Error('Migration target does not match configuration'), { code: 'migration_environment_mismatch' });
  const pool = createMetabloomSavedWorkPool(config);
  try {
    const result = await migrateMetabloomSavedWork({ pool, config });
    console.log(JSON.stringify({ result: 'ok', environment: config.environment,
      schemaVersion: result.schemaVersion, applied: result.applied }));
  } finally { await pool.end(); }
}

if (require.main === module) main().catch(error => {
  // Connection errors can include credentials or SQL. Print only a fixed code.
  const allowed = new Set(['migration_arguments_required', 'migration_environment_mismatch',
    'saved_work_environment_mismatch', 'saved_work_migration_mismatch']);
  console.error(allowed.has(error?.code) ? error.code : 'saved_work_unavailable');
  process.exitCode = 1;
});

module.exports = { main };
