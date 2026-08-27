/** @param { import("knex").Knex } knex */
exports.up = async function (knex) {
  if (await knex.schema.hasColumn('proxy', 'refresh_url')) return;
  await knex.schema.alterTable('proxy', table => {
    table.string('refresh_url').nullable();
  });
};

/** @param { import("knex").Knex } knex */
exports.down = async function (knex) {
  if (!(await knex.schema.hasColumn('proxy', 'refresh_url'))) return;
  await knex.schema.alterTable('proxy', table => {
    table.dropColumn('refresh_url');
  });
};
