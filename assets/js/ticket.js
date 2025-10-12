// ticket.js
document.addEventListener('DOMContentLoaded', () => {
  const form          = document.querySelector('form.ticket-form');
  const buyBtn        = document.getElementById('buyBtn');
  const modal         = document.getElementById('swishModal');
  const closeModalBtn = document.getElementById('closeModal');
  const openSwishBtn  = document.getElementById('openSwishBtn');
  const qrImg         = document.querySelector('.swish-qr');

  // Inputs / outputs
  const typeSelect    = form?.querySelector('select[name="type"]');
  const qtyInput      = form?.querySelector('input[name="qty"]');
  const nameInput     = form?.querySelector('input[name="name"]');
  const amountOut     = document.getElementById('amountOut');
  const messageOut    = document.getElementById('messageOut');
  const EVENT_LABEL   = 'Vardan Petrosyan';

  // === Configure your backend endpoint here ===
  const BACKEND_URL = 'https://<your-vercel-app>.vercel.app/api/swish/create';

  const isMobile = /android|iphone|ipad|ipod|windows phone/i.test(navigator.userAgent);

  // ---------- Helpers ----------
  const formatSEK = (n) => new Intl.NumberFormat('sv-SE').format(n); // 1000 -> "1 000"

  // Prefer data-price on <option>, fallback to parsing "(500 kr)" in text
  function getUnitPriceSEK() {
    const opt = typeSelect?.selectedOptions?.[0];
    if (!opt) return 0;
    const dp = opt.getAttribute('data-price');
    if (dp) return Number(dp);
    const m = (opt.textContent || '').match(/(\d[\d\s]*)\s*kr/i);
    return m ? parseInt(m[1].replace(/\s/g, ''), 10) : 0;
  }

  function updateAmounts() {
    const qty   = Math.max(1, parseInt(qtyInput?.value || '1', 10));
    const unit  = getUnitPriceSEK();
    const total = unit * qty;

    if (amountOut) amountOut.textContent = formatSEK(total);

    if (messageOut) {
      const name = (nameInput?.value || '').trim();
      messageOut.textContent = name ? `${name} – ${EVENT_LABEL}` : EVENT_LABEL;
    }
  }

  function openModal()  { updateAmounts(); modal?.removeAttribute('hidden'); }
  function closeModal() { modal?.setAttribute('hidden', ''); }

  // New: create payment via backend → get deep link with token
  async function createSwishPayment(totalAmount, description, orderId) {
    const resp = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
      body: JSON.stringify({
        amount: totalAmount,
        message: description,
        orderId
      })
    });

    const data = await resp.json();
    if (!resp.ok || !data?.deeplink) {
      const reason = data?.error || 'Okänt fel';
      throw new Error(`Kunde inte skapa Swish-betalning: ${reason}`);
    }
    return data.deeplink; // swish://payment?token=...&callbackurl=...
  }

  // Render a QR for the deep link (desktop fallback)
  function setQrForDeepLink(deeplink) {
    if (!qrImg) return;
    // Use a lightweight QR image service (client-side only)
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(deeplink);
    qrImg.src = url;
  }

  // Make sure buy button isn’t a submit and isn’t disabled
  buyBtn?.setAttribute('type', 'button');
  buyBtn?.removeAttribute('aria-disabled');
  if (buyBtn) buyBtn.disabled = false;

  // Desktop: disable the deep-link button in the modal (we’ll show QR instead)
  if (!isMobile && openSwishBtn) {
    openSwishBtn.setAttribute('aria-disabled', 'true');
    openSwishBtn.removeAttribute('href');
    openSwishBtn.setAttribute('tabindex', '-1');
    openSwishBtn.title = 'Öppna i mobilen';
    openSwishBtn.addEventListener('click', e => e.preventDefault());
  }

  // Live updates when user edits fields
  typeSelect?.addEventListener('change', updateAmounts);
  qtyInput?.addEventListener('input', updateAmounts);
  nameInput?.addEventListener('input', updateAmounts);

  // (Optional) QR diagnostics
  qrImg?.addEventListener('error', () => console.warn('QR image failed:', qrImg.currentSrc));
  qrImg?.addEventListener('load',  () => console.log('QR image loaded:', qrImg.currentSrc));

  // Buy click
  buyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Require valid form fields first
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const qty   = Math.max(1, parseInt(qtyInput?.value || '1', 10));
    const unit  = getUnitPriceSEK();
    const total = unit * qty;
    if (!total || total <= 0) {
      alert('Belopp saknas eller är ogiltigt.');
      return;
    }
    const ticketLabel = typeSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Biljett';
    const descName    = (nameInput?.value || '').trim();
    const description = `${descName ? descName + ' – ' : ''}${EVENT_LABEL} – ${ticketLabel} x${qty}`;
    const orderId     = (crypto?.randomUUID && crypto.randomUUID()) || String(Date.now());

    try {
      const deeplink = await createSwishPayment(total, description, orderId);

      if (isMobile) {
        // Mobile: open Swish app with prefilled data
        window.location.href = deeplink;
        // (Optional) if you want a fallback modal if app doesn’t open:
        const wasHidden = document.visibilityState === 'hidden';
        const t = setTimeout(() => {
          if (document.visibilityState === 'visible' && !wasHidden) {
            setQrForDeepLink(deeplink);
            openModal();
          }
        }, 2500);
        const cancel = () => clearTimeout(t);
        window.addEventListener('blur', cancel, { once: true });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') cancel();
        }, { once: true });
      } else {
        // Desktop: show QR so the user scans with Swish
        setQrForDeepLink(deeplink);
        openModal();
      }
    } catch (err) {
      console.error(err);
      alert('Kunde inte skapa Swish-betalning. Försök igen om en stund.');
    }
  });

  closeModalBtn?.addEventListener('click', closeModal);

  // On mobile, allow opening Swish from the modal (if you want a retry)
  if (isMobile && openSwishBtn) {
    openSwishBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      // Recreate payment to avoid expired tokens
      const qty   = Math.max(1, parseInt(qtyInput?.value || '1', 10));
      const unit  = getUnitPriceSEK();
      const total = unit * qty;
      const ticketLabel = typeSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Biljett';
      const descName    = (nameInput?.value || '').trim();
      const description = `${descName ? descName + ' – ' : ''}${EVENT_LABEL} – ${ticketLabel} x${qty}`;
      const orderId     = (crypto?.randomUUID && crypto.randomUUID()) || String(Date.now());
      try {
        const deeplink = await createSwishPayment(total, description, orderId);
        window.location.href = deeplink;
      } catch (err) {
        console.error(err);
        alert('Kunde inte öppna Swish.');
      }
    });
  }

  // Initialize on load
  updateAmounts();
});
