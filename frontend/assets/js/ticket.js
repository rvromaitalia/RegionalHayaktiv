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
  const EVENT_LABEL   = 'Akop Jan';

  // Backend endpoint
  const BACKEND_URL =
    'https://hayaktiv-payments.rvromaitalia.workers.dev/api/swish/create';

  const isMobile = /android|iphone|ipad|ipod|windows phone/i.test(
    navigator.userAgent
  );

  let lastDeeplink = null;

  // ---------- Helpers ----------
  const formatSEK = (n) => new Intl.NumberFormat('sv-SE').format(n);

  const params = new URLSearchParams(location.search);
  if (params.get('paid') === '1') {
    document.querySelector('#flash')?.insertAdjacentHTML(
      'afterbegin',
      '<div class="notice success">Tack! Om betalningen gick igenom får du strax bekräftelse.</div>'
    );
  }

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
      messageOut.textContent = name
        ? `${name} – ${EVENT_LABEL}`
        : EVENT_LABEL;
    }
  }

  function openModal()  { updateAmounts(); modal?.removeAttribute('hidden'); }
  function closeModal() { modal?.setAttribute('hidden', ''); }

  // ---- API call ----
  async function createSwishPayment(totalAmount, description) {
    const resp = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
      body: JSON.stringify({
        amount: totalAmount,
        message: description
      })
    });

    const data = await resp.json();
    if (!resp.ok || !data?.deeplink) {
      const reason = data?.error || 'Okänt fel';
      throw new Error(reason);
    }
    return data.deeplink;
  }

  // QR rendering (desktop)
  function setQrForDeepLink(deeplink) {
    if (!qrImg) return;
    qrImg.src =
      'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
      encodeURIComponent(deeplink);
  }

  // Button safety
  buyBtn?.setAttribute('type', 'button');
  if (buyBtn) buyBtn.disabled = false;

  // Desktop: disable openSwishBtn
  if (!isMobile && openSwishBtn) {
    openSwishBtn.setAttribute('aria-disabled', 'true');
    openSwishBtn.setAttribute('tabindex', '-1');
    openSwishBtn.addEventListener('click', (e) => e.preventDefault());
  }

  // Live updates
  typeSelect?.addEventListener('change', updateAmounts);
  qtyInput?.addEventListener('input', updateAmounts);
  nameInput?.addEventListener('input', updateAmounts);

  // Buy click
  buyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();

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
    const description =
      `${descName ? descName + ' ' : ''}${EVENT_LABEL} ${ticketLabel} ${qty}`;

    try {
      const deeplink = await createSwishPayment(total, description);
      lastDeeplink = deeplink;

      if (isMobile && openSwishBtn) {
        openSwishBtn.href = deeplink;
        openSwishBtn.style.display = 'inline-block';
      }

      if (isMobile) {
        window.location.href = deeplink;

        // fallback if app doesn’t open
        const t = setTimeout(() => {
          setQrForDeepLink(deeplink);
          openModal();
        }, 2500);

        window.addEventListener('blur', () => clearTimeout(t), { once: true });
      } else {
        setQrForDeepLink(deeplink);
        openModal();
      }
    } catch (err) {
      console.error(err);
      alert('Kunde inte skapa Swish-betalning.');
    }
  });

  closeModalBtn?.addEventListener('click', closeModal);
  updateAmounts();
});
