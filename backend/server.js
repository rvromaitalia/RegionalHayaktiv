import express from "express";
import https from "https";
import fs from "fs";
import crypto from "crypto";

const app = express();
app.use(express.json());

// -----------------------------
// Config (env vars + cert files)
// -----------------------------
const apiBase = process.env.SWISH_API_BASE;         // e.g. https://mss.cpc.getswish.net/swish-cpcapi/api/v2
const payeeAliasRaw = process.env.SWISH_PAYEE_ALIAS; // e.g. 1234661658 (digits only)

// Cert/key file paths (defaults assume files are in same folder as server.js, for tesing only)
const SWISH_CERT_PATH = process.env.SWISH_CERT_PATH || "./swish-client-chain.pem";
const SWISH_KEY_PATH  = process.env.SWISH_KEY_PATH  || "./swish-test-client.key";
const SWISH_CA_PATH   = process.env.SWISH_CA_PATH   || "./Swish_TLS_RootCA.pem";


// CORS: allow your GitHub Pages domain (change if needed)
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "https://regionalhayaktiv.org";

if (!apiBase || !payeeAliasRaw) {
  console.error("Missing SWISH_API_BASE or SWISH_PAYEE_ALIAS");
  process.exit(1);
}

// Normalize payee alias (remove spaces/dashes just in case)
const payeeAlias = String(payeeAliasRaw).replace(/[^\d]/g, "");

// Load certificate, key, and Swish Root CA
let cert;
let key;
let ca;

try {
  cert = fs.readFileSync(SWISH_CERT_PATH); // e.g. ./swish-client-chain.pem
  key  = fs.readFileSync(SWISH_KEY_PATH);  // e.g. ./swish-test-client.key
  ca   = fs.readFileSync(SWISH_CA_PATH);   // e.g. ./Swish_TLS_RootCA.pem
} catch (e) {
  console.error("Failed to read cert/key/ca files. Check paths:");
  console.error("SWISH_CERT_PATH =", SWISH_CERT_PATH);
  console.error("SWISH_KEY_PATH  =", SWISH_KEY_PATH);
  console.error("SWISH_CA_PATH   =", SWISH_CA_PATH);
  console.error(e);
  process.exit(1);
}

// mTLS agent (sends client cert + chain and trusts Swish Root CA)
const httpsAgent = new https.Agent({
  cert,
  key,
  ca,
  minVersion: "TLSv1.2",
  maxVersion: "TLSv1.2",
  servername: "mss.cpc.getswish.net",
});

// -----------------------------
// Helpers
// -----------------------------
function sanitizeSwishMessage(input) {
  // Swish allows: A–Z a–z 0–9 and space, max 50 chars
  return String(input || "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function generateSwishReference() {
  // Swish-safe reference: A–Z a–z 0–9, max 35 chars
  return crypto.randomUUID().replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Preflight for CORS
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    setCors(res);
    return res.status(204).end();
  }
  next();
});

// -----------------------------
// Routes
// -----------------------------
app.get("/health", (req, res) => {
  setCors(res);
  res.status(200).send("ok");
});

// CREATE SWISH PAYMENT
app.post("/api/swish/create", async (req, res) => {
  setCors(res);

  try {
    const amount = Number(req.body.amount);
    const message = sanitizeSwishMessage(req.body.message);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (!message) {
      return res.status(400).json({ error: "Invalid message" });
    }

    const instructionUUID = crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const payeePaymentReference = generateSwishReference();

    // IMPORTANT: callback must point to THIS backend (not GitHub Pages)
    // If you're behind a proxy later, you may need X-Forwarded-Proto handling.
    const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (!baseUrl.startsWith("https://")) {
    return res.status(500).json({
        error: "Server misconfigured",
        details: "PUBLIC_BASE_URL must be set and start with https://",
    });
    }
    const callbackUrl = `${baseUrl}/api/swish/callback`;


    const payload = {
      payeePaymentReference,
      callbackUrl,
      payeeAlias,
      amount: amount.toFixed(2),
      currency: "SEK",
      message,
    };

    const swishUrl = `${apiBase}/paymentrequests/${instructionUUID}`;
    console.log("Calling Swish URL:", swishUrl);
    console.log("Payload:", payload);

    const result = await new Promise((resolve, reject) => {
      const u = new URL(swishUrl);

      const req2 = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search, // includes /swish-cpcapi/api/v2/paymentrequests/{uuid}
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          agent: httpsAgent, // ✅ this sends your client cert (mTLS)
        },
        (resp) => {
          let data = "";
          resp.on("data", (c) => (data += c));
          resp.on("end", () =>
            resolve({ status: resp.statusCode ?? 0, body: data })
          );
        }
      );

      req2.on("error", reject);
      req2.write(JSON.stringify(payload));
      req2.end();
    });

    if (result.status < 200 || result.status >= 300) {
      console.error("Swish error:", result.status, result.body);
      return res.status(502).json({
        error: "Swish API error",
        status: result.status,
        details: result.body,
      });
    }

    // In Swish PUT flow, token = instructionUUID
    const token = instructionUUID;
    const deeplink = `swish://paymentrequest?token=${encodeURIComponent(token)}`;

    return res.status(200).json({
      token,
      deeplink,
      payeePaymentReference,
      callbackUrl,
    });
  } catch (e) {
    console.error("Create failed:", e);
    return res.status(500).json({
      error: "Internal error",
      details: String(e?.message || e),
    });
  }
});

// SWISH CALLBACK (status updates)
app.post("/api/swish/callback", (req, res) => {
  // Swish servers call this endpoint
  // Log the payload for now; later you’ll update DB status here.
  console.log("Swish callback received:", req.body);

  // Swish expects 200 OK
  res.status(200).send("OK");
});

// -----------------------------
// Start server
// -----------------------------
const PORT = Number(process.env.PORT || 8080);
console.log("Starting backend...");
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
