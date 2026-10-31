import './ui/styles.css';
import { demoArchive } from './demo/persona';
import { landingView, demoView } from './ui/views';
import { lockSession, vaultView } from './ui/vaultView';

const main = document.getElementById('main')!;
const root = document.documentElement;

function route(): void {
  const r = location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('nav a').forEach((a) => {
    a.toggleAttribute('aria-current', a.getAttribute('href') === `#${r}`);
  });
  if (r === '/demo') main.replaceChildren(demoView(demoArchive()));
  else if (r === '/vault') void vaultView(main);
  else main.replaceChildren(landingView());
  document.title = 'Evermind' + (r === '/' ? ' — a private memory that outlasts you' : '');
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function toggleTheme(): void {
  const dark =
    root.dataset['theme'] === 'dark' ||
    (!root.dataset['theme'] && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  root.dataset['theme'] = next;
  try {
    localStorage.setItem('evermind-theme', next);
  } catch {
    /* storage unavailable: theme still applies for this session */
  }
}

const dialog = document.getElementById('shortcuts') as HTMLDialogElement;
document.getElementById('theme')!.addEventListener('click', toggleTheme);
document.getElementById('help')!.addEventListener('click', () => dialog.showModal());

let pendingG = false;
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (pendingG) {
    pendingG = false;
    const dest = { h: '/', d: '/demo', v: '/vault' }[e.key];
    if (dest) location.hash = `#${dest}`;
    return;
  }
  if (e.key === 'g') pendingG = true;
  else if (e.key === 't') toggleTheme();
  else if (e.key === '?') dialog.showModal();
});

// Lock when the tab is closed or hidden for a long time is a later hardening item; for now,
// the key only ever lives in memory and disappears on reload.
window.addEventListener('pagehide', lockSession);
window.addEventListener('hashchange', route);
route();
