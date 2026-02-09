export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CORS ---
    const CORS_HEADERS = {
      "Access-Control-Allow-Origin": "https://regionalhayaktiv.org",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      // Optional but recommended:
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
    // Creates an order in D1 + creates Swish payment request via Merchant API (mTLS)
    // Returns a valid Swish deeplink: swish://paymentrequest?token=...
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

        // Ensure required env vars exist
        const apiBase = env.SWISH_API_BASE;
        const payeeAlias = env.SWISH_PAYEE_ALIAS;

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

        // 2) Create Swish Merchant API payment request (mTLS)
        // NOTE: some Swish setups use PUT /paymentrequests/{instructionUUID}
        // This version uses POST /paymentrequests. If your Swish docs say PUT, tell me and I’ll adapt it.
        const payload = {
          payeePaymentReference: orderId,
          callbackUrl: "https://regionalhayaktiv.org/?paid=1", // temporary; later we’ll implement real callback
          payeeAlias,
          amount: amount.toFixed(2), // Swish typically expects "1000.00"
          currency: "SEK",
          message,
        };

        const swishResp = await env.SWISH_MTLS.fetch(`${apiBase}/paymentrequests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const respText = await swishResp.text();

        if (!swishResp.ok) {
          // Log full Swish error so you can see it in `wrangler tail`
          console.error("Swish API error", {
            status: swishResp.status,
            body: respText,
          });

          // Mark order as failed
          await env.DB.prepare(`UPDATE orders SET status = ? WHERE id = ?`)
            .bind("SWISH_ERROR", orderId)
            .run();

          return json(
            {
              error: "Swish API error",
              swishStatus: swishResp.status,
              details: respText,
            },
            502
          );
        }

        // 3) Extract token (depends on Swish version: Location header or JSON body)
        const location = swishResp.headers.get("location") || swishResp.headers.get("Location");

        let token = null;
        try {
          const obj = JSON.parse(respText || "{}");
          token = obj.token || obj.id || obj.paymentRequestToken || null;
        } catch {
          // ignore parse errors
        }

        // If token is in location like .../paymentrequests/{id}
        if (!token && location) {
          token = location.split("/").pop();
        }

        if (!token) {
          console.error("Swish token missing", { location, respText });

          await env.DB.prepare(`UPDATE orders SET status = ? WHERE id = ?`)
            .bind("SWISH_NO_TOKEN", orderId)
            .run();

          return json(
            {
              error: "No token returned from Swish",
              location,
              details: respText,
            },
            502
          );
        }

        // 4) Store token in D1 (requires column swish_token)
        // If you don’t have it yet: ALTER TABLE orders ADD COLUMN swish_token TEXT;
        await env.DB.prepare(`UPDATE orders SET status = ?, swish_token = ? WHERE id = ?`)
          .bind("TOKEN_CREATED", token, orderId)
          .run();

        // ✅ Correct Swish deeplink format (fixes “Incorrect link”)
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
