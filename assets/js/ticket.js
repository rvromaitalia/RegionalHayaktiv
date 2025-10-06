// /assets/js/swish.js
(function () {
  const buyBtn = document.getElementById('buyBtn');
  const modal  = document.getElementById('swishModal');

  const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);

  function openModal() { modal?.removeAttribute('hidden'); }
  function tryOpenSwish() {
    // This works reliably only if you have a token from Swish m-commerce:
    // const url = `swish://paymentrequest?token=${encodeURIComponent(TOKEN)}&callbackurl=${encodeURIComponent('https://your.site/thanks')}`;
    // Temporary best-effort (may do nothing on many browsers):
    const url = 'swish://';
    window.location.href = url;
  }

  buyBtn?.addEventListener('click', () => {
    if (isMobile) {
      // Attempt to open app; fallback to modal after 1s
      let fellBack = false;
      const t = setTimeout(() => { fellBack = true; openModal(); }, 1000);
      tryOpenSwish();
      // if the app opens, the page typically goes to background; if not, modal appears
    } else {
      // Desktop: always show QR fallback
      openModal();
    }
  });

  // Close button in your modal
  document.getElementById('closeModal')?.addEventListener('click', () => {
    modal?.setAttribute('hidden', '');
  });
})();
