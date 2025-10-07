// ticket.js
document.addEventListener('DOMContentLoaded', () => {
  const form          = document.querySelector('form.ticket-form');
  const buyBtn        = document.getElementById('buyBtn');
  const modal         = document.getElementById('swishModal');
  const closeModalBtn = document.getElementById('closeModal');
  const qtyInput      = form?.querySelector('input[name="qty"]');
  const qtyOut        = document.getElementById('qtyOut');
  const openSwishBtn  = document.getElementById('openSwishBtn');
  const qrImg         = document.querySelector('.swish-qr');
  const isMobile = /android|iphone|ipad|ipod|windows phone/i.test(navigator.userAgent);

  function openModal(){ if(qtyOut&&qtyInput) qtyOut.textContent = qtyInput.value||'1'; modal?.removeAttribute('hidden'); }
  function closeModal(){ modal?.setAttribute('hidden',''); }
  function tryOpenSwish(){
    const ua = navigator.userAgent.toLowerCase();
    if(ua.includes('android')) window.location.href='intent://#Intent;scheme=swish;package=se.bankgirot.swish;end';
    else window.location.href='swish://';
  }

  // Ensure buy button isn’t a submit and not “greyed”
  buyBtn?.setAttribute('type','button'); buyBtn?.removeAttribute('aria-disabled'); if(buyBtn) buyBtn.disabled=false;

  // Desktop: disable the Swish deep link button
  if(!isMobile && openSwishBtn){
    openSwishBtn.setAttribute('aria-disabled','true');
    openSwishBtn.removeAttribute('href');
    openSwishBtn.setAttribute('tabindex','-1');
    openSwishBtn.title='Öppna i mobilen';
    openSwishBtn.addEventListener('click', e => e.preventDefault());
  }

  // Helpful diagnostics for the QR
  qrImg?.addEventListener('error', ()=> console.warn('QR image failed:', qrImg.currentSrc));
  qrImg?.addEventListener('load',  ()=> console.log('QR image loaded:', qrImg.currentSrc));

  buyBtn?.addEventListener('click', (e)=>{
    e.preventDefault(); e.stopPropagation();
    if(form && !form.checkValidity()){ form.reportValidity(); return; }

    if(isMobile){
      const wasHidden = document.visibilityState==='hidden';
      const t = setTimeout(()=>{ if(document.visibilityState==='visible' && !wasHidden) openModal(); }, 2500);
      const cancel = ()=> clearTimeout(t);
      window.addEventListener('blur', cancel, {once:true});
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') cancel(); }, {once:true});
      tryOpenSwish();
    } else {
      openModal(); // Desktop: show QR immediately
    }
  });

  closeModalBtn?.addEventListener('click', closeModal);

  // Mobile: allow opening Swish from inside modal
  if(isMobile && openSwishBtn){
    openSwishBtn.addEventListener('click', (e)=>{ e.preventDefault(); tryOpenSwish(); });
  }
});
