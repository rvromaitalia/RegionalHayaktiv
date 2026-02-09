export default {
  async fetch(request, env) {
    const url = new URL(request.url);

<<<<<<< HEAD
    // --- CORS ---
    const CORS_HEADERS = {
      "Access-Control-Allow-Origin": "https://regionalhayaktiv.org",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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

    // Create order + return deeplink (placeholder)
    if (url.pathname === "/api/swish/create" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));

        const amount = Number(body.amount);
        const message = String(body.message || "").slice(0, 50);

        if (!Number.isFinite(amount) || amount <= 0) {
          return json({ error: "Invalid amount" }, 400);
        }
        if (!message) {
          return json({ error: "Missing message" }, 400);
        }

        const orderId = body.orderId || crypto.randomUUID();

        await env.DB.prepare(
          `INSERT INTO orders (id, created_at, amount, message, status)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(orderId, new Date().toISOString(), amount, message, "CREATED")
          .run();

        const payee = "1234048179"; // your Swish number
        const deeplink =
          `swish://payment?payee=${encodeURIComponent(payee)}` +
          `&amount=${encodeURIComponent(String(amount))}` +
          `&message=${encodeURIComponent(message)}`;

        return json({ orderId, deeplink }, 200);
      } catch (err) {
        console.error("Create failed:", err);
        return json({ error: "Internal error", details: String(err) }, 500);
      }
    }

    // Status
    if (url.pathname === "/api/swish/status" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing id" }, 400);

      const row = await env.DB.prepare(
        `SELECT id, status, amount, message, created_at FROM orders WHERE id = ?`
      )
        .bind(id)
        .first();

      if (!row) return json({ error: "Not found" }, 404);
      return json(row, 200);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
