import jwt from "jsonwebtoken";

import { config } from "../config.js";

export interface TokenPayload {
  sub: string;
  email: string;
}

export const signAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenTtl,
  });

export const verifyAccessToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, config.auth.jwtSecret);
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  return { sub: String(decoded.sub), email: String(decoded.email) };
};
