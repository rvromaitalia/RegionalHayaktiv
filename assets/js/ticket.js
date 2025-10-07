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

  function openModal()       { updateAmounts(); modal?.removeAttribute('hidden'); }
  function closeModal()      { modal?.setAttribute('hidden', ''); }

  function tryOpenSwish() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) {
      window.location.href = 'intent://#Intent;scheme=swish;package=se.bankgirot.swish;end';
    } else {
      window.location.href = 'swish://';
    }
  }

  // Make sure buy button isn’t a submit and isn’t disabled
  buyBtn?.setAttribute('type', 'button');
  buyBtn?.removeAttribute('aria-disabled');
  if (buyBtn) buyBtn.disabled = false;

  // Desktop: disable the deep-link button in the modal
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
  nameInput?.addEventListener('input', updateAmounts);  // <-- added

  // (Optional) QR diagnostics
  qrImg?.addEventListener('error', () => console.warn('QR image failed:', qrImg.currentSrc));
  qrImg?.addEventListener('load',  () => console.log('QR image loaded:', qrImg.currentSrc));

  // Buy click
  buyBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Require valid form fields first
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (isMobile) {
      // Try to open the app; if page doesn’t go to background, show fallback after ~2.5s
      const wasHidden = document.visibilityState === 'hidden';
      const t = setTimeout(() => {
        if (document.visibilityState === 'visible' && !wasHidden) openModal();
      }, 2500);

      const cancel = () => clearTimeout(t);
      window.addEventListener('blur', cancel, { once: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') cancel();
      }, { once: true });

      tryOpenSwish();
    } else {
      // Desktop: show QR + total immediately
      openModal();
    }
  });

  closeModalBtn?.addEventListener('click', closeModal);

  // On mobile, allow opening Swish from the modal
  if (isMobile && openSwishBtn) {
    openSwishBtn.addEventListener('click', (e) => {
      e.preventDefault();
      tryOpenSwish();
    });
  }

  // Initialize on load
  updateAmounts();
});
