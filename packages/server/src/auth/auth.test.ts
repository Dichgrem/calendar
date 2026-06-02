import { describe, it, expect } from "vitest";
import { randomBytes, timingSafeEqual } from "node:crypto";
import scrypt from "scrypt-js";

function hashPassword(password: string, salt: string): string {
  const passwordBytes = new TextEncoder().encode(password);
  const saltBytes = new TextEncoder().encode(salt);
  const key = scrypt.syncScrypt(passwordBytes, saltBytes, 16384, 8, 1, 64);
  return Buffer.from(key).toString("hex");
}

describe("hashPassword", () => {
  it("produces consistent output for same input", () => {
    const h1 = hashPassword("test", "salt123");
    const h2 = hashPassword("test", "salt123");
    expect(h1).toBe(h2);
  });

  it("produces different output for different passwords", () => {
    const h1 = hashPassword("password1", "salt");
    const h2 = hashPassword("password2", "salt");
    expect(h1).not.toBe(h2);
  });

  it("produces different output for different salts", () => {
    const h1 = hashPassword("test", "salt1");
    const h2 = hashPassword("test", "salt2");
    expect(h1).not.toBe(h2);
  });

  it("produces 128-character hex string (64 bytes)", () => {
    const hash = hashPassword("test", "salt");
    expect(hash).toHaveLength(128);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });
});

describe("password verification", () => {
  function verifyPassword(password: string, storedHash: string, salt: string): boolean {
    const inputHash = hashPassword(password, salt);
    const storedBuf = Buffer.from(storedHash, "hex");
    const inputBuf = Buffer.from(inputHash, "hex");
    if (storedBuf.length !== inputBuf.length) return false;
    return timingSafeEqual(storedBuf, inputBuf);
  }

  it("verifies correct password", () => {
    const salt = randomBytes(16).toString("hex");
    const hash = hashPassword("correct", salt);
    expect(verifyPassword("correct", hash, salt)).toBe(true);
  });

  it("rejects wrong password", () => {
    const salt = randomBytes(16).toString("hex");
    const hash = hashPassword("correct", salt);
    expect(verifyPassword("wrong", hash, salt)).toBe(false);
  });

  it("rejects with wrong salt", () => {
    const hash = hashPassword("test", "salt1");
    expect(verifyPassword("test", hash, "salt2")).toBe(false);
  });

  it("rejects with different-length hash (tampered)", () => {
    expect(verifyPassword("test", "deadbeef", "salt")).toBe(false);
  });
});
