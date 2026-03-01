// src/server.js
import fs from "fs";
import https from "https";
import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";

// ✅ Always load prod env file
dotenv.config({ path: ".env.prod" });

// ---- Basic config ----
const app = express();
const PORT = Number(process.env.PORT || 3000);

// IMPORTANT: must be BEFORE routes
app.use(express.json());

// Simple CORS (adjust as needed)
app.use((req, res, next) => {
  const allowedOrigins = new Set([
    "https://regionalhayaktiv.org",
    "https://www.regionalhayaktiv.org",
    // optional dev:
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
  ]);

  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});


console.log("SWISH_API_BASE:", process.env.SWISH_API_BASE);


// ---- Validate required env ----
const apiBase = process.env.SWISH_API_BASE; // e.g. https://cpc.getswish.net/swish-cpcapi/api/v2
const payeeAliasRaw = process.env.SWISH_PAYEE_ALIAS; // digits only
const baseUrlRaw = process.env.PUBLIC_BASE_URL; // e.g. https://swish-api.regionalhayaktiv.org
const returnUrlRaw = process.env.SWISH_RETURN_URL; // e.g. https://regionalhayaktiv.org/swish/return

if (!apiBase || !payeeAliasRaw || !baseUrlRaw) {
  console.error("Missing SWISH_API_BASE or SWISH_PAYEE_ALIAS or PUBLIC_BASE_URL");
  process.exit(1);
}
if (!returnUrlRaw) {
  console.warn(
    "SWISH_RETURN_URL not set. Deeplinks may fail to open in Swish without callbackurl."
  );
}

const baseUrl = baseUrlRaw.replace(/\/+$/, ""); // trim trailing slash
const returnUrl = (returnUrlRaw || `${baseUrl}/`).replace(/\/+$/, "");

// Paths
const p12Path = process.env.SWISH_P12_PATH; // certs/Swish_Merchant_Prod.p12
const p12Pass = process.env.SWISH_P12_PASSPHRASE;
const caPath = process.env.SWISH_CA_PATH; // certs/Swish_TLS_Root_CA.pem

if (!p12Path || !p12Pass || !caPath) {
  console.error("Missing SWISH_P12_PATH, SWISH_P12_PASSPHRASE, or SWISH_CA_PATH");
  process.exit(1);
}

// Read cert material once
let agent;
try {
  const pfx = fs.readFileSync(p12Path);
  const ca = fs.readFileSync(caPath);

  agent = new https.Agent({
    pfx,
    passphrase: p12Pass,
    ca,
    keepAlive: true,
    // You can set rejectUnauthorized: true (default). Keep it true for prod.
  });
} catch (e) {
  console.error("Failed reading cert files:", e?.message || e);
  process.exit(1);
}

// ---- Helpers ----
function sanitizeSwishMessage(input) {
  const s = String(input || "").trim();
  // Swish allows: A–Z a–z 0–9 and space, max 50 chars
  return s.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 50);
}


function formatSwishQrAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Invalid amount");
  }
  // Swish QR requires comma + 2 decimals
  return n.toFixed(2).replace(".", ",");
}

function encodeSwishQrMessage(message, maxLen = 70) {
  const s = String(message || "").trim();
  const truncated =
    s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;

  // IMPORTANT: QR payload needs percent-encoding, not "+"
  return encodeURIComponent(truncated);
}

function generateSwishReference() {
  // Swish-safe reference: A–Z a–z 0–9, max 35 chars
  return crypto.randomBytes(12).toString("hex").slice(0, 24);
}

function httpRequestJson({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);

    const payload = body ? JSON.stringify(body) : "";
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        agent,
      },
      (resp) => {
        let data = "";
        resp.on("data", (chunk) => (data += chunk));
        resp.on("end", () => {
          // Try JSON parse, but keep raw if not JSON
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = null;
          }

          resolve({
            status: resp.statusCode || 0,
            headers: resp.headers || {},
            bodyText: data,
            bodyJson: parsed,
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function httpRequestBinary({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : "";

    const req = https.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        agent, // <-- ADD THIS LINE
      },
      (resp) => {
        const chunks = [];
        resp.on("data", (c) => chunks.push(c));
        resp.on("end", () => {
          resolve({
            status: resp.statusCode || 0,
            headers: resp.headers || {},
            buffer: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}


// ---- Routes ----
app.get("/health", (req, res) => res.status(200).send("ok"));

app.post("/api/swish/qr/prefilled", async (req, res) => {
  try {
    // 1) Read + validate input
    const amount = Number(req.body.amount);
    const message = sanitizeSwishMessage(req.body.message);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // 2) Swish QR generator "prefilled" endpoint (returns a PNG)
    const url = "https://mpc.getswish.net/qrg-swish/api/v1/prefilled";

    const payee = process.env.SWISH_PAYEE_ALIAS; // digits only
    if (!payee) {
      return res.status(500).json({ error: "Missing SWISH_PAYEE_ALIAS" });
    }

    // 3) Build request for QR generator API
    // IMPORTANT:
    // - amount should be a NUMBER (not "850,00")
    // - message should be plain text (not URL-encoded)
    const body = {
      format: "png",
      size: 420,
      payee: { value: payee, editable: false },
      amount: { value: amount, editable: false },
      message: { value: message, editable: false },
    };

    // 4) Call QR service
    const qrResp = await httpRequestBinary({ method: "POST", url, body });

    // 5) If Swish QR service rejects it, forward debug info
    if (qrResp.status !== 200) {
      const contentType = String(qrResp.headers?.["content-type"] || "");
      const isText = contentType.includes("json") || contentType.includes("text");

      return res.status(502).json({
        error: "Swish prefilled QR API error",
        swishStatus: qrResp.status,
        swishContentType: contentType,
        swishBody: isText ? qrResp.buffer.toString("utf8").slice(0, 1000) : "(binary)",
        requestSent: { payee, amount, message }, // helpful for debugging
      });
    }

    // 6) Success: return PNG
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(qrResp.buffer);
  } catch (e) {
    console.error("QR prefilled error:", e);
    return res.status(500).json({
      error: "Internal error",
      details: String(e?.message || e),
    });
  }
});



// ✅ Swish server-to-server callback (must be reachable publicly via HTTPS)
app.post("/api/swish/callback", (req, res) => {
  // In production: validate fields, store/update payment status, make it idempotent.
  console.log("✅ Swish callback received:", req.body);
  res.status(200).send("OK");
});

// ✅ Create Swish payment request (PUT flow)
app.post("/api/swish/create", async (req, res) => {
  try {
    const amount = String(req.body.amount || "").trim();
    const message = sanitizeSwishMessage(req.body.message);
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const payeePaymentReference = generateSwishReference();
    const callbackUrl = `${baseUrl}/api/swish/callback`;

    const instructionUUID = crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const swishUrl = `${apiBase}/paymentrequests/${instructionUUID}`;

    const body = {
      payeeAlias: payeeAliasRaw,
      amount,
      currency: "SEK",
      message,
      callbackUrl,
      payeePaymentReference,
    };

    console.log("Swish request body:", body);

    console.log("Calling Swish URL:", swishUrl);
 
    const result = await httpRequestJson({ method: "PUT", url: swishUrl, body });

    // Swish expects 201 Created
    if (result.status !== 201) {
      console.error("Swish API error:", result.status, result.bodyJson || result.bodyText);
      return res.status(result.status || 502).json({
        error: "Swish API error",
        swishStatus: result.status,
        swishBody: result.bodyJson || result.bodyText,
      });
    }
    console.log("Swish response status:", result.statusCode);
    console.log("Swish response headers:", result.headers);
    console.log("Swish response body:", result.body);

    // Token: often returned as header `paymentrequesttoken`.
    // In Swish PUT flow, token is also commonly the instructionUUID.
    const headerToken =
      result.headers?.paymentrequesttoken ||
      result.headers?.paymentRequestToken ||
      result.headers?.["paymentrequesttoken"];

    const token = String(headerToken || instructionUUID);

    let deeplink = `swish://paymentrequest?token=${encodeURIComponent(token)}`;

    if (process.env.SWISH_RETURN_URL) {
      deeplink += `&callbackurl=${encodeURIComponent(returnUrl)}`;
    }
    return res.status(200).json({
      token,
      deeplink,
      payeePaymentReference,
      callbackUrl,
      location: result.headers?.location || null,
    });
  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({
      error: "Internal error",
      details: String(err?.message || err),
    });
  }
});

// Optional: keep your older endpoint if you still call it from elsewhere.
// If you don’t need it, delete it to avoid confusion.
app.post("/api/swish/paymentrequests", async (req, res) => {
  return res.status(410).json({
    error: "Deprecated endpoint",
    hint: "Use POST /api/swish/create instead",
  });
});

app.listen(PORT, () => {
  console.log(`Starting backend...`);
  console.log(`Listening on http://localhost:${PORT}`);
});
