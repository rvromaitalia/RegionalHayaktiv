
  // Admin modal logic (separate from ticket.js)
  const adminBtn = document.getElementById('adminLoginBtn');
  const adminModal = document.getElementById('adminModal');
  const adminForm = document.getElementById('adminLoginForm');
  const adminError = document.getElementById('adminLoginError');

  function openAdminModal() {
    adminModal.hidden = false;
    adminModal.setAttribute('aria-hidden', 'false');
    adminError.hidden = true;
    adminForm?.querySelector('input[name="username"]')?.focus();
  }

  function closeAdminModal() {
    adminModal.hidden = true;
    adminModal.setAttribute('aria-hidden', 'true');
    adminForm?.reset();
    adminError.hidden = true;
  }

  adminBtn?.addEventListener('click', openAdminModal);

  adminModal?.addEventListener('click', (e) => {
    if (e.target?.dataset?.close === "1") closeAdminModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && adminModal && !adminModal.hidden) closeAdminModal();
  });

  adminForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    adminError.hidden = true;

    const fd = new FormData(adminForm);
    const payload = {
      username: String(fd.get('username') || ''),
      password: String(fd.get('password') || '')
    };

    // For now: just show payload in console.
    // Next step we will POST to your Node backend /api/login.
    console.log("Admin login submit:", payload);

    // TODO next: call backend, then redirect to /admin.html
    // closeAdminModal();
  });
