import { User } from "./users.js";
import { Request, Response } from "express";
import { Database } from "sqlite";

// --- BWRequest typing ---
export interface BWRequest extends Request {
  files?: any;
  db?: Database;
}

// --- Get auth token from request ---
export function getAuthToken(req: BWRequest): string | undefined {
  return req.headers["bw-auth-token"] as string | undefined;
}

// --- Helper functions ---
export function value2(v: any): any {
  if (v == null) return null;
  return typeof v === "object" ? v[0] : v;
}

interface RequestBody {
  [index: string]: any;
}

export function value(body: RequestBody, name: string): any {
  const v = body[name];
  return v == null ? null : typeof v === "object" ? v[0] : v;
}

// --- Validate auth token ---
export type ValidAuthToken = {
  ok: boolean;
  user?: User;
  authToken?: string;
};

export function validAuthToken(
  req: BWRequest,
  res: Response,
  bodyCheck: boolean
): ValidAuthToken {
  const authToken = getAuthToken(req);
  if (!authToken) {
    res.status(405).json({ error: 405, error_msg: "missing authentication token" });
    return { ok: false };
  }

  const userId = (global as any).authTokens?.[authToken];
  if (userId == undefined) {
    res.status(405).json({ error: 405, error_msg: "unauthenticated user" });
    return { ok: false };
  }

  if (bodyCheck && (!req.body || Object.keys(req.body).length === 0)) {
    res.status(400).json({ error: "no body" });
    return { ok: false };
  }

  return { ok: true, user: new User(userId), authToken };
}

// --- ISO Date string helper ---
export function dateString(date?: Date): string {
  if (!date) date = new Date();
  const datePart = (n: number) => (n < 10 ? "0" + n : "" + n);

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
}

// --- Two-level deep clone of array ---
export function cloneArray<Type>(array: Type[]): Type[] {
  const newArray: Type[] = [];
  for (const value of array) {
    if (typeof value === "object" && value !== null) {
      newArray.push(Object.assign({}, value));
    } else {
      newArray.push(value);
    }
  }
  return newArray;
}
