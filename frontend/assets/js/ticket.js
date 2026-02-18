// ticket.js
document.addEventListener('DOMContentLoaded', () => {
  const form          = document.querySelector('form.ticket-form');
  const buyBtn        = document.getElementById('buyBtn');
  const modal         = document.getElementById('swishModal');
  const closeModalBtn = document.getElementById('closeModal');
  const openSwishBtn  = document.getElementById('openSwishBtn');
  //const qrImg         = document.querySelector('.swish-qr');
  //const qrImg = document.querySelector('#swishModal .swish-qr');
  const qrImg = document.getElementById('swishQr'); // instead of querySelector('.swish-qr'

  const nameInput     = form?.querySelector('input[name="name"]');
  const amountOut     = document.getElementById('amountOut');
  const messageOut    = document.getElementById('messageOut');

  // Hidden fields (Formspree)
  const hOrd  = document.getElementById('qty_ordinarie');
  const hUng  = document.getElementById('qty_ungdom');
  const hBarn = document.getElementById('qty_barn');
  const hTot  = document.getElementById('qty_total');
  const hAmt  = document.getElementById('total_amount');

  const EVENT_LABEL = 'Akop Jan';

  const BACKEND_URL = 'https://api.regionalhayaktiv.org/api/swish/create';
  //const BACKEND_URL = 'http://localhost:3000/api/swish/create';

  const isMobile = /android|iphone|ipad|ipod|windows phone/i.test(
    navigator.userAgent
  );

  const formatSEK = (n) => new Intl.NumberFormat('sv-SE').format(n);

  function getTicketRows() {
    return Array.from(form?.querySelectorAll('.ticket-row') || []);
  }

  function clampInt(v, min, max) {
    const n = Number.parseInt(String(v), 10);
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function readSelections() {
    const rows = getTicketRows();

    const result = {
      ordinarie: 0,
      ungdom: 0,
      barn: 0,
      totalQty: 0,
      totalAmount: 0,
      breakdownText: []
    };

    for (const row of rows) {
      const type = row.getAttribute('data-type');
      const price = Number(row.getAttribute('data-price') || 0);

      const input = row.querySelector('.qty-input');
      const qty = clampInt(input?.value ?? 0, 0, 99);

      if (input && String(qty) !== String(input.value)) input.value = String(qty);

      if (type === 'ordinarie') result.ordinarie = qty;
      if (type === 'ungdom') result.ungdom = qty;
      if (type === 'barn') result.barn = qty;

      result.totalQty += qty;
      result.totalAmount += qty * price;

      if (qty > 0) {
        const label =
          row.querySelector('.ticket-name')?.textContent?.trim() || type;
        result.breakdownText.push(`${label} x${qty}`);
      }
    }

    return result;
  }

  function syncHiddenFields(sel) {
    if (hOrd)  hOrd.value  = String(sel.ordinarie);
    if (hUng)  hUng.value  = String(sel.ungdom);
    if (hBarn) hBarn.value = String(sel.barn);
    if (hTot)  hTot.value  = String(sel.totalQty);
    if (hAmt)  hAmt.value  = String(sel.totalAmount);
  }

  function updateOutputs() {
    const sel = readSelections();
    syncHiddenFields(sel);

    if (amountOut) amountOut.textContent = formatSEK(sel.totalAmount);

    if (messageOut) {
      const name = (nameInput?.value || '').trim();
      const lines = sel.breakdownText.length ? sel.breakdownText.join(', ') : 'Inga biljetter valda';
      messageOut.textContent = name
        ? `${name} – ${EVENT_LABEL} (${lines})`
        : `${EVENT_LABEL} (${lines})`;
    }

    return sel;
  }

  function openModal()  { updateOutputs(); modal?.removeAttribute('hidden'); }
  function closeModal() { modal?.setAttribute('hidden', ''); }

  //async function createSwishPayment(totalAmount, description) {
  //  const resp = await fetch(BACKEND_URL, {
  //    method: 'POST',
  //    headers: { 'Content-Type': 'application/json' },
  //    mode: 'cors',
  //    body: JSON.stringify({
  //      amount: totalAmount,
  //      message: description
  //    })
  //  });

async function createSwishPayment(totalAmount, description) {
  const amountStr = Number(totalAmount).toFixed(2);

  let resp;
  try {
    resp = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
      body: JSON.stringify({
        amount: amountStr,
        message: description
      })
    });
  } catch (e) {
    // Network / CORS / DNS errors
    throw new Error(`Nätverksfel / CORS: ${e.message}`);
  }

  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ignore JSON parse errors
  }

  if (!resp.ok) {
    throw new Error(
      (data && (data.details || data.error)) ||
      `HTTP ${resp.status}: ${text}`
    );
  }

  if (!data?.deeplink || !data?.token) {
    throw new Error('Saknar deeplink eller token i Swish-svar');
  }

  return {
    deeplink: data.deeplink,
    token: data.token
  };
}

function setQrForToken(token) {
  if (!qrImg) return;

  // Remove responsive image overrides
  qrImg.removeAttribute('srcset');
  qrImg.removeAttribute('sizes');

  // Swish scanner-compatible payload
  const payload = `CPC?token=${token}`;

  qrImg.src =
    'https://api.qrserver.com/v1/create-qr-code/' +
    '?size=420x420' +
    '&ecc=H' +
    '&margin=2' +
    '&data=' + encodeURIComponent(payload) +
    '&_=' + Date.now(); // cache-buster
}

  // Stepper events
  form?.addEventListener('click', (e) => {
    const btn = e.target.closest('.step-btn');
    if (!btn) return;

    const row = btn.closest('.ticket-row');
    const input = row?.querySelector('.qty-input');
    if (!row || !input) return;

    const action = btn.getAttribute('data-action');
    const current = clampInt(input.value, 0, 99);

    const next = action === 'inc' ? current + 1 : current - 1;
    input.value = String(clampInt(next, 0, 99));

    updateOutputs();
  });

  form?.addEventListener('input', (e) => {
    if (e.target.matches('.qty-input') || e.target === nameInput) {
      updateOutputs();
    }
  });

  // Button safety
  buyBtn?.setAttribute('type', 'button');
  if (buyBtn) buyBtn.disabled = false;

  // Desktop: disable openSwishBtn
  if (!isMobile && openSwishBtn) {
    openSwishBtn.setAttribute('aria-disabled', 'true');
    openSwishBtn.setAttribute('tabindex', '-1');
    openSwishBtn.addEventListener('click', (e) => e.preventDefault());
  }

  buyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();

    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const sel = updateOutputs();

    if (!sel.totalQty) {
      alert('Välj minst 1 biljett.');
      return;
    }

    if (!sel.totalAmount || sel.totalAmount <= 0) {
      alert('Belopp saknas eller är ogiltigt.');
      return;
    }

    const descName = (nameInput?.value || '').trim();
    const breakdown = sel.breakdownText.join(', ');
    const description =
      `${descName ? descName + ' – ' : ''}${EVENT_LABEL}: ${breakdown}`;

    try {
      const { deeplink, token } = await createSwishPayment(sel.totalAmount, description);
      if (isMobile && openSwishBtn) {
        openSwishBtn.href = deeplink;
        openSwishBtn.style.display = 'inline-block';
      }

      if (isMobile) {
        window.location.href = deeplink;

        const t = setTimeout(() => {
          setQrForToken(token);
          openModal();
        }, 2500);

        window.addEventListener('blur', () => clearTimeout(t), { once: true });
      } else {
        setQrForToken(token);
        openModal();
      }
    } catch (err) {
      console.error(err);
      alert(`Kunde inte skapa Swish-betalning: ${err.message}`);
    }
  });

  closeModalBtn?.addEventListener('click', closeModal);

  // init
  updateOutputs();
});
