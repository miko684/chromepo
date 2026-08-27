exports.up = async function (knex) {
  const hasUrl = await knex.schema.hasColumn('proxy', 'subscription_url');
  if (!hasUrl) {
    await knex.schema.alterTable('proxy', table => {
      table.text('subscription_url').nullable();
      table.timestamp('subscription_updated_at').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasUrl = await knex.schema.hasColumn('proxy', 'subscription_url');
  if (hasUrl) await knex.schema.alterTable('proxy', table => {
    table.dropColumn('subscription_url');
    table.dropColumn('subscription_updated_at');
  });
};
