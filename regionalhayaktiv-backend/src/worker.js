export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS (so your static site can call this API)
    const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://regionalhayaktiv.org",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    };

    function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Backend is running ✅", {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // 1) Create an order + return a Swish deeplink (placeholder)
    if (url.pathname === "/api/swish/create" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));

      const amount = Number(body.amount);
      const message = String(body.message || "").slice(0, 50);

      if (!Number.isFinite(amount) || amount <= 0) {
        return json({ error: "Invalid amount" }, 400, corsHeaders);
      }
      if (!message) {
        return json({ error: "Missing message" }, 400, corsHeaders);
      }

      // Create simple order id
      const orderId = body.orderId || crypto.randomUUID();

      // Save to D1
      await env.DB.prepare(
        `INSERT INTO orders (id, created_at, amount, message, status)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(orderId, new Date().toISOString(), amount, message, "CREATED")
        .run();

      // Placeholder deeplink (we will replace with real Swish Merchant API later)
      const payee = "1234048179"; // TODO: replace with YOUR Swish number
      const deeplink =
        `swish://payment?payee=${encodeURIComponent(payee)}` +
        `&amount=${encodeURIComponent(String(amount))}` +
        `&message=${encodeURIComponent(message)}`;

      return json({ orderId, deeplink }, 200, corsHeaders);
    }

    // 2) Check status (for polling / confirmation)
    if (url.pathname === "/api/swish/status" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing id" }, 400, corsHeaders);

      const row = await env.DB.prepare(
        `SELECT id, status, amount, message, created_at FROM orders WHERE id = ?`
      ).bind(id).first();

      if (!row) return json({ error: "Not found" }, 404, corsHeaders);
      return json(row, 200, corsHeaders);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}