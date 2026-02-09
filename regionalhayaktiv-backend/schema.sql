CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  amount INTEGER NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  swish_payment_ref TEXT,
  payer_alias TEXT,
  raw_callback TEXT
);