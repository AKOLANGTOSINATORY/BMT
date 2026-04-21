// index.js — BMT SYSTEM BACKEND (Rank Sync API)

const express = require("express");
const rbx = require("noblox.js");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// =============================
// ENV
// =============================
const COOKIE = process.env.COOKIE;

if (!COOKIE) {
  console.error("❌ Missing COOKIE in environment variables");
  process.exit(1);
}

// =============================
// LICENSE SYSTEM
// =============================
const VALID_KEYS = new Set([
  "9e2c7b4f1a6d0e8f5c3b9a4d7e1f2c8b6a5",
  "f3a9e1c6d7b0f5e8a2c4b9d1e6f7a3c8b5",
  "6f1e9b3a7d5c8e0f4a2b6d9c1e7f5a8b3",
  "c7b1a9f6e4d8c5f0a2b3e7d1f9a6c8e4",
  "8a5e2d9c1f6b4a7e0f3c8d5b9f1a6e4c2",
  "e4b9f0a7c6d1e8f5a3b2c9d4f7a1e6c8",
  "5c8e1f4a9d6b0c2e7f3a5b8d1c9f6e4",
  "a0f6c9e2b5d8a1f7c4e3b9d6f5a8c2",
  "d9c2f6e1a8b7d4f0c5e9a3b6c8f1e7",
  "1f8c6b9e4a0d5f7c2e3b1a9d6f8c4e",
]);

const KEY_BINDINGS = new Map();

function validateKey(key, placeId) {
  if (!key || !placeId) return { ok: false, error: "MISSING_PARAMS" };
  if (!VALID_KEYS.has(key)) return { ok: false, error: "INVALID_KEY" };

  const bound = KEY_BINDINGS.get(key);

  if (!bound) {
    KEY_BINDINGS.set(key, placeId);
    console.log(`🔐 Key bound to PlaceId ${placeId}`);
    return { ok: true };
  }

  if (bound !== placeId) {
    return { ok: false, error: "KEY_ALREADY_USED" };
  }

  return { ok: true };
}

function requireLicense(req, res) {
  const key = String(req.query.key || "");
  const placeId = Number(req.query.placeid);

  const result = validateKey(key, placeId);

  if (!result.ok) {
    res.status(403).json(result);
    return null;
  }

  return { key, placeId };
}

// =============================
// BOT STATE
// =============================
let BOT_USER_ID = null;

// =============================
// COOLDOWN SYSTEM
// =============================
const COOLDOWN = new Map();
const COOLDOWN_MS = 0;

function isCooldown(k) {
  if (COOLDOWN_MS <= 0) return false;

  const now = Date.now();
  const last = COOLDOWN.get(k) || 0;

  if (now - last < COOLDOWN_MS) return true;

  COOLDOWN.set(k, now);
  return false;
}

// =============================
// ROBLOX LOGIN
// =============================
async function start() {
  await rbx.setCookie(COOKIE);
  console.log("✅ Logged into Roblox BMT Backend");

  const me = await rbx.getCurrentUser();
  BOT_USER_ID = Number(me.UserID);

  console.log(`🤖 Bot UserId: ${BOT_USER_ID}`);

  // =============================
  // ROOT
  // =============================
  app.get("/", (req, res) => {
    res.send("BMT System Backend is running.");
  });

  // =============================
  // VALIDATE LICENSE
  // =============================
  app.get("/validate", (req, res) => {
    const key = req.query.key;
    const placeId = Number(req.query.placeid);

    const result = validateKey(key, placeId);

    if (!result.ok) {
      return res.status(403).json(result);
    }

    return res.json({
      ok: true,
      boundPlaceId: placeId,
    });
  });

  // =============================
  // SETRANK (MAIN BMT FUNCTION)
  // =============================
  app.get("/setrank", async (req, res) => {
    const lic = requireLicense(req, res);
    if (!lic) return;

    const userId = Number(req.query.userid);
    const rank = Number(req.query.rank);
    const groupId = Number(req.query.groupid);

    if (!userId || !rank || !groupId) {
      return res.status(400).json({ ok: false, error: "BAD_PARAMS" });
    }

    const key = `${lic.placeId}:${groupId}:${userId}`;
    if (isCooldown(key)) {
      return res.status(429).json({ ok: false, error: "COOLDOWN" });
    }

    try {
      const currentRank = await rbx.getRankInGroup(groupId, userId);

      if (currentRank === rank) {
        return res.json({ ok: true, ignored: "SAME_ROLE" });
      }

      // BOT SAFETY CHECK
      if (BOT_USER_ID) {
        const botRank = await rbx.getRankInGroup(groupId, BOT_USER_ID);

        if (rank >= botRank) {
          return res.status(403).json({
            ok: false,
            error: "BOT_INSUFFICIENT_RANK",
          });
        }
      }

      await rbx.setRank(groupId, userId, rank);

      return res.json({
        ok: true,
        from: currentRank,
        to: rank,
      });
    } catch (err) {
      console.error("❌ SETRANK ERROR:", err);

      return res.status(500).json({
        ok: false,
        error: "SETRANK_FAILED",
        message: err.message,
      });
    }
  });

  // =============================
  // START SERVER
  // =============================
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`🚀 BMT Backend running on port ${PORT}`);
  });
}

// =============================
start().catch((err) => {
  console.error("❌ Startup failed:", err);
});
