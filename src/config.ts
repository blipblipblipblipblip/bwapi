import path, { dirname } from "path";
import { fileURLToPath } from "url";

// Compute __dirname (Node ES module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// You *MUST* change this to your server address (used for thumbnails etc.)
const Config = {
  HOST: process.env.HOST || "https://bwsecondary.ddns.net:8080",
  PORT: process.env.PORT || 3000,
  ROOT_NAME: __dirname, // root folder of the project
  EARLY_ACCESS: true,
  VERSION: "0.9.3",
  /// How many worlds each player can have
  MAX_WORLD_LIMIT: 200,
  DATABASE_PATH: path.join(__dirname, "database.db") // absolute path for SQLite
};

export default Config;
