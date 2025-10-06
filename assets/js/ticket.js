(() => {
  const form = document.querySelector('form.ticket-form');
  if (!form) return;

  const buyBtn = document.getElementById('buyBtn');
  const modal  = document.getElementById('swishModal');
  const closeModal = document.getElementById('closeModal');
  const qtyInput = form.querySelector('input[name="qty"]');
  const qtyOut   = document.getElementById('qtyOut');
  const endpoint = form.getAttribute('action');

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  async function submitFormspree(){
    try{
      const fd = new FormData(form);
      await fetch(endpoint, {
        method:'POST',
        headers:{ 'Accept':'application/json' },
        body: fd
      });
    }catch(e){
      console.error(e);
    }
  }

  function openSwishOrFallback(){
    if(!form.reportValidity()) return;

    if(qtyOut) qtyOut.textContent = qtyInput?.value || '1';

    // Send booking in background
    submitFormspree();

    if(isMobile()){
      let opened = false;
      const t = setTimeout(() => { if(!opened) modal.hidden = false; }, 900);

      // Try to open the app (cannot prefill without Swish Handel)
      window.location.href = 'swish://';

      // If we switch away quickly, assume app opened
      document.addEventListener('visibilitychange', () => {
        if(document.hidden){ opened = true; clearTimeout(t); }
      }, { once:true });
    } else {
      // Desktop → show QR/instructions directly
      modal.hidden = false;
    }
  }

  buyBtn?.addEventListener('click', openSwishOrFallback);
  closeModal?.addEventListener('click', () => modal.hidden = true);
  modal?.addEventListener('click', e => { if(e.target === modal) modal.hidden = true; });
})();