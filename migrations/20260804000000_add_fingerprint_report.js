exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('window', 'fingerprint_report');
  if (!hasColumn) {
    await knex.schema.alterTable('window', table => {
      table.text('fingerprint_report').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('window', 'fingerprint_report');
  if (hasColumn) {
    await knex.schema.alterTable('window', table => {
      table.dropColumn('fingerprint_report');
    });
  }
};
