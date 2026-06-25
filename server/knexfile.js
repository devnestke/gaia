const path = require("path");

// Same SQLite config for every environment. Render sets NODE_ENV=production,
// so the config must exist under that key (and not only `development`), or
// knex reports "Required configuration option 'client' is missing."
const dbFile = process.env.DB_FILE || path.resolve(__dirname, "dev.sqlite3");

/** @type {import('knex').Knex.Config} */
const config = {
  client: "sqlite3",
  connection: {
    filename: dbFile,
  },
  migrations: {
    directory: path.resolve(__dirname, "migrations"),
  },
  useNullAsDefault: true,
};

module.exports = {
  development: config,
  production: config,
};
