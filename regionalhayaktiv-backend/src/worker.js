export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CORS ---
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

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Backend is running ✅", {
        headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
      });
    }

    // --------------------------------------------
    // POST /api/swish/create
    // Creates order in D1 + creates Swish payment request via Merchant API (mTLS)
    // Returns deeplink: swish://paymentrequest?token=...
    // --------------------------------------------
    if (url.pathname === "/api/swish/create" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));

        const amount = Number(body.amount);
        const message = String(body.message || "").slice(0, 50);
        const orderId = body.orderId || crypto.randomUUID();

        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "Invalid amount" }, 400);
        }
        if (!message) {
          return json({ error: "Missing message" }, 400);
        }

        // Required env vars
        const apiBase = env.SWISH_API_BASE;        // e.g. https://cpc.getswish.net/swish-cpcapi/api/v2
        const payeeAlias = env.SWISH_PAYEE_ALIAS;  // your Swish number

        if (!apiBase || !payeeAlias) {
          return json(
            {
              error: "Missing server configuration",
              details: "SWISH_API_BASE and/or SWISH_PAYEE_ALIAS are not set",
            },
            500
          );
        }

        // 1) Save initial order in D1
        await env.DB.prepare(
          `INSERT INTO orders (id, created_at, amount, message, status)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(orderId, new Date().toISOString(), amount, message, "CREATED")
          .run();

        // 2) Create payment request (PUT variant)
        // In this variant, instructionUUID is the id/token for the payment request.
        const instructionUUID = crypto.randomUUID();

        const payload = {
          payeePaymentReference: orderId,
          callbackUrl: "https://regionalhayaktiv.org/?paid=1", // temporary
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
            {
              error: "Swish API error",
              swishStatus: swishResp.status,
              details: respText || "(empty body)",
            },
            502
          );
        }

        // 3) Token in PUT flow = instructionUUID (don’t try to parse body)
        const token = instructionUUID;

        // 4) Store token in D1
        await env.DB.prepare(
          `UPDATE orders SET status = ?, swish_token = ? WHERE id = ?`
        )
          .bind("TOKEN_CREATED", token, orderId)
          .run();

        // 5) Return correct Swish deeplink
        const deeplink = `swish://paymentrequest?token=${encodeURIComponent(token)}`;

        return json({ orderId, token, deeplink }, 200);
      } catch (err) {
        console.error("Create failed:", err);
        return json({ error: "Internal error", details: String(err) }, 500);
      }
    }

    // --------------------------------------------
    // GET /api/swish/status?id=...
    // --------------------------------------------
    if (url.pathname === "/api/swish/status" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing id" }, 400);

      const row = await env.DB.prepare(
        `SELECT id, status, amount, message, created_at, swish_token
         FROM orders
         WHERE id = ?`
      )
        .bind(id)
        .first();

      if (!row) return json({ error: "Not found" }, 404);
      return json(row, 200);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
