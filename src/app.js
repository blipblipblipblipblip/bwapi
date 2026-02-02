/**
 * bwapi - Blocksworld API server reimplementation
 */

import fs from "fs";
import multiparty from "multiparty";
import bodyParser from "body-parser";
import express, { Express, Request, Response } from "express";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { BWRequest, getAuthToken } from "./util.js";
import { migrateOldFiles } from "./analytics.js";
import { User } from "./users.js";
import config from "./config.js";

// --- Globals ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(global as any).__filename = __filename;
(global as any).__dirname = __dirname;
(global as any).HOST = config.HOST;
(global as any).ROOT_NAME = config.ROOT_NAME;
(global as any).EARLY_ACCESS = config.EARLY_ACCESS;
(global as any).VERSION = config.VERSION;
(global as any).MAX_WORLD_LIMIT = config.MAX_WORLD_LIMIT;
(global as any).authTokens = {};
(global as any).capabilities = { bwapi: { version: config.VERSION } };

// --- Helper Functions ---
(global as any).getAuthToken = function (req: Request): string | undefined {
  return req.headers["bw-auth-token"] as string | undefined;
};

(global as any).value2 = function (v: any): any {
  if (v == null) return null;
  return typeof v === "object" ? v[0] : v;
};

(global as any).value = function (body: any, name: string): any {
  let v = body[name];
  return v == null ? null : typeof v === "object" ? v[0] : v;
};

(global as any).validAuthToken = function (
  req: Request,
  res: Response,
  bodyCheck: boolean
): { ok: boolean; user?: User; authToken?: string } {
  let authToken = (global as any).getAuthToken(req);
  if (!authToken) {
    res.status(405).json({ error: 405, error_msg: "missing authentication token" });
    return { ok: false };
  }
  let userId = (global as any).authTokens[authToken];
  if (!userId) {
    res.status(405).json({ error: 405, error_msg: "unauthenticated user" });
    return { ok: false };
  }
  if (bodyCheck && (!req.body || Object.keys(req.body).length === 0)) {
    res.status(400).json({ error: "no body" });
    return { ok: false };
  }
  return { ok: true, user: new User(userId), authToken };
};

function datePart(num: number): string {
  return num < 10 ? "0" + num : "" + num;
}

(global as any).dateString = function (date?: Date): string {
  if (!date) date = new Date();
  return (
    date.getUTCFullYear() +
    "-" +
    datePart(date.getUTCMonth() + 1) +
    "-" +
    datePart(date.getUTCDate()) +
    "T" +
    datePart(date.getUTCHours()) +
    ":" +
    datePart(date.getUTCMinutes()) +
    ":" +
    datePart(date.getUTCSeconds()) +
    "+00:00"
  );
};

// --- Main async function ---
async function main() {
  // --- Database ---
  const db = await open({ filename: config.DATABASE_PATH, driver: sqlite3.Database });
  await db.run(`PRAGMA journal_mode = wal; PRAGMA foreign_keys = on;`);
  await db.migrate({});

  const app: Express = express();

  app.use(compression());

  // --- Middleware ---
  app.use((express_req: Request, res: Response, next: () => void) => {
    const req = express_req as BWRequest;
    let authToken = getAuthToken(req);
    let userId: string | undefined = undefined;
    if (authToken) userId = (global as any).authTokens[authToken];
    console.debug(req.method + " " + req.url, userId);
    req.db = db;
    res.set("Server", "BWAPI 0.9.1");
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });

  app.disable("x-powered-by");

  // Body parsing
  app.use((req: Request, res: Response, next: () => void) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      const form = new multiparty.Form();
      (form as any).maxFieldsSize = 1024 * 1024 * 16;
      form.parse(req, (err, fields, files) => {
        if (err) console.error(err);
        (req as BWRequest).body = fields;
        (req as BWRequest).files = files;
        next();
      });
    } else if (contentType.includes("application/json")) {
      bodyParser.json({ limit: "50mb" })(req, res, next);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      (req as BWRequest).files = {};
      bodyParser.urlencoded({ extended: false, limit: "50mb" })(req, res, next);
    } else next();
  });

  // --- Load modules ---
  const cores = fs.readdirSync("modules");
  for (const file of cores) {
    if (file !== "app.js") {
      const mod = await import("./" + file);
      if (mod.run) mod.run(app, db);
    }
  }

  await migrateOldFiles(db);

  // --- JSON endpoints ---
  const loadJSON = (filePath: string) =>
    JSON.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));

  app.get("/api/v1/steam-app-remote-configuration", (req, res) => {
    res.status(200).send(JSON.stringify(loadJSON("conf/steam_app_remote_configuration.json")));
  });

  app.get("/api/v1/app-remote-configuration", (req, res) => {
    res.status(200).json(loadJSON("conf/app_remote_configuration.json"));
  });

  const contentCategories = JSON.stringify(loadJSON("conf/content_categories.json"));
  app.get("/api/v1/content-categories-no-ip", (req, res) => res.status(200).send(contentCategories));
  app.get("/api/v1/content-categories", (req, res) => res.status(200).send(contentCategories));

  const blocksPricings = JSON.stringify(loadJSON("conf/blocks_pricings.json"));
  app.get("/api/v1/block_items/pricing", (req, res) => res.status(200).send(blocksPricings));

  const coinPacks = JSON.stringify(loadJSON("conf/coin_packs.json"));
  app.get("/api/v1/store/coin_packs", (req, res) => res.status(200).send(coinPacks));

  // --- Static files ---
  app.use("/images", express.static("images", { extensions: ["png", "jpg"], maxAge: "5m" }));

  // --- Fallback handlers ---
  app.all("/api/v1/*", (req, res) =>
    res.status(404).json({ error: "404", error_msg: "Not Found" })
  );
  app.all("/api/v2/*", (req, res) =>
    res.status(404).json({ error: "404", error_msg: "Missing or invalid API endpoint" })
  );
  app.all("*", (req, res) => res.status(403).send("Forbidden"));

  // --- Start server ---
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`BWAPI running on port ${PORT}`));
}

// Run main
main().catch((err) => console.error("Server failed:", err));

export default null; // export something to satisfy ES module
