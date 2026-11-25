let deferredPrompt = null;
const button = document.querySelector('#install-button');
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const sync = () => { if (button) button.hidden = standalone(); };
sync();
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; sync(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; if (button) button.hidden = true; });
matchMedia('(display-mode: standalone)').addEventListener('change', sync);

export async function installHelp() {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
      return;
    } catch {}
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const body = document.querySelector('#modal-body');
  document.querySelector('#modal-title').textContent = 'Instal Haura Institute';
  body.innerHTML = `<div class="install-help"><p>Aplikasi menggunakan logo Haura Institute yang sama dengan ikon layar utama.</p>${ios ? '<p><b>iPhone / iPad:</b> buka situs di Safari → Bagikan → Tambahkan ke Layar Utama → Tambahkan. Prompt instal otomatis tidak tersedia di iOS.</p>' : '<p><b>Android:</b> buka situs melalui Chrome atau Edge → menu ⋮ → Instal aplikasi / Tambahkan ke layar utama.</p><p><b>Komputer:</b> gunakan Chrome atau Edge, lalu pilih ikon instal pada bilah alamat atau menu browser.</p>'}<p>Jika tombol belum memunculkan dialog instal: tunggu pemuatan halaman selesai, gunakan HTTPS, dan pastikan aplikasi belum terpasang. Pada browser dalam aplikasi WhatsApp/Instagram, pilih “Buka di browser”. Ketersediaan instalasi ditentukan oleh browser.</p><p class="muted">Mode offline mendukung akses Login tersimpan dan membaca Buku Digital yang sudah diunduh. Transaksi, pendaftaran, dan diskusi SBAR memerlukan internet.</p></div>`;
  document.querySelector('#modal').showModal();
}

button?.addEventListener('click', installHelp);

const network = () => {
  const el = document.querySelector('#network-status');
  if (!el) return;
  el.hidden = navigator.onLine;
  if (!navigator.onLine) {
    el.textContent = 'Mode offline aktif — Login & Buku Digital tetap tersedia. Fitur lainnya terkunci hingga internet terhubung.';
  }
};
window.addEventListener('online', network);
window.addEventListener('offline', network);
network();

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), {scope: new URL('../', import.meta.url).pathname});
      const announce = () => { document.querySelector('#update-notice').hidden = false; };
      if (registration.waiting) announce();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(); });
      });
      document.querySelector('#update-button').addEventListener('click', () => { registration.waiting?.postMessage({type: 'SKIP_WAITING'}); });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && registration.active && !document.querySelector('#update-notice').hidden) { reloading = true; location.reload(); } });
    } catch (error) { console.warn('Service worker belum aktif:', error.message); }
  });
}
