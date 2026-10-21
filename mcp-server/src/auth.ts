import { Request, Response, NextFunction } from "express";
import { MCP_AUTH_TOKEN } from "./config";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader || typeof authHeader !== "string") {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Missing Bearer token" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || parts[1] !== MCP_AUTH_TOKEN) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid token" });
    return;
  }

  next();
}