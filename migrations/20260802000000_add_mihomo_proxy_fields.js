/**
 * Stores imported mihomo nodes alongside the existing HTTP/SOCKS proxy records.
 * `proxy` remains the remote endpoint so old UI/API consumers keep working.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const columns = await knex('proxy').columnInfo();
  const missing = name => !Object.prototype.hasOwnProperty.call(columns, name);
  if (missing('node_config') || missing('node_name') || missing('local_port') || missing('status') || missing('latency')) {
    await knex.schema.alterTable('proxy', table => {
      if (missing('node_config')) table.text('node_config').nullable();
      if (missing('node_name')) table.string('node_name').nullable();
      // Do not add a unique constraint here: older databases may already
      // contain allocated ports and SQLite cannot safely alter that index.
      if (missing('local_port')) table.integer('local_port').nullable();
      if (missing('status')) table.string('status').nullable();
      if (missing('latency')) table.integer('latency').nullable();
    });
  }
};

/** @param { import("knex").Knex } knex */
exports.down = async function (knex) {
  const columns = await knex('proxy').columnInfo();
  const existing = name => Object.prototype.hasOwnProperty.call(columns, name);
  if (['node_config', 'node_name', 'local_port', 'status', 'latency'].some(existing)) {
    await knex.schema.alterTable('proxy', table => {
      if (existing('node_config')) table.dropColumn('node_config');
      if (existing('node_name')) table.dropColumn('node_name');
      if (existing('local_port')) table.dropColumn('local_port');
      if (existing('status')) table.dropColumn('status');
      if (existing('latency')) table.dropColumn('latency');
    });
  }
};
