function sanitizeSwishMessage(input) {
  return String(input || "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function generateSwishReference() {
  // Swish-safe: only A–Z a–z 0–9, max 35 chars (we use 20)
  return crypto.randomUUID().replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const CORS_HEADERS = {
      "Access-Control-Allow-Origin": "https://regionalhayaktiv.org",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Backend is running ✅", {
        headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
      });
    }

    // -------- CREATE --------
    if (url.pathname === "/api/swish/create" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));

        const amount = Number(body.amount);
        const message = sanitizeSwishMessage(body.message);

        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "Invalid amount" }, 400);
        }
        if (!message) {
          return json({ error: "Invalid message" }, 400);
        }

        const apiBase = env.SWISH_API_BASE;
        const payeeAlias = env.SWISH_PAYEE_ALIAS;
        if (!apiBase || !payeeAlias) {
          return json(
            { error: "Server misconfigured", details: "Missing SWISH_API_BASE or SWISH_PAYEE_ALIAS" },
            500
          );
        }

        // IMPORTANT:
        // orderId = internal DB id (can be UUID with hyphens)
        // payeePaymentReference = Swish-safe reference (NO hyphens)
        const orderId = crypto.randomUUID();
        const payeePaymentReference = generateSwishReference();

        await env.DB.prepare(
          `INSERT INTO orders (id, created_at, amount, message, status, payee_reference)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(orderId, new Date().toISOString(), amount, message, "CREATED", payeePaymentReference)
          .run();

        const instructionUUID = crypto.randomUUID();
        const callbackUrl = `https://${url.host}/api/swish/callback`;

        const payload = {
          payeePaymentReference, // ✅ Swish-safe now
          callbackUrl,
          payeeAlias,
          amount: amount.toFixed(2),
          currency: "SEK",
          message,
        };

        const swishResp = await env.SWISH_MTLS.fetch(
          `${apiBase}/paymentrequests/${instructionUUID}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        const respText = await swishResp.text();

        if (!swishResp.ok) {
          console.error("Swish API error", { status: swishResp.status, body: respText });

          await env.DB.prepare(`UPDATE orders SET status = ? WHERE id = ?`)
            .bind("SWISH_ERROR", orderId)
            .run();

          return json(
            { error: "Swish API error", swishStatus: swishResp.status, details: respText },
            502
          );
        }

        const token = instructionUUID;

        await env.DB.prepare(`UPDATE orders SET status = ?, swish_token = ? WHERE id = ?`)
          .bind("TOKEN_CREATED", token, orderId)
          .run();

        const deeplink = `swish://paymentrequest?token=${encodeURIComponent(token)}`;

        // Return the server-generated orderId so frontend can poll status
        return json({ orderId, token, deeplink }, 200);
      } catch (err) {
        console.error("Create failed:", err);
        return json({ error: "Internal error", details: String(err) }, 500);
      }
    }

    // -------- CALLBACK --------
    if (url.pathname === "/api/swish/callback" && request.method === "POST") {
      try {
        const data = await request.json().catch(() => ({}));

        // Swish sends back payeePaymentReference (your Swish-safe ref).
        // We map it back to our order via payee_reference.
        const payeeRef = data.payeePaymentReference;
        const status = data.status || "UNKNOWN";

        if (payeeRef) {
          await env.DB.prepare(`UPDATE orders SET status = ? WHERE payee_reference = ?`)
            .bind(status, payeeRef)
            .run();
        }

        return new Response(null, { status: 204 });
      } catch (err) {
        console.error("Callback failed:", err);
        return new Response(null, { status: 204 });
      }
    }

    // -------- STATUS --------
    if (url.pathname === "/api/swish/status" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing id" }, 400);

      const row = await env.DB.prepare(
        `SELECT id, status, amount, message, created_at, swish_token, payee_reference
         FROM orders WHERE id = ?`
      )
        .bind(id)
        .first();

      if (!row) return json({ error: "Not found" }, 404);
      return json(row, 200);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
