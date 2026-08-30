/* Quick Login demo
 * Flujo: crear/verificar PIN local -> selector de cuentas -> sesión iniciada.
 * El PIN nunca se guarda en claro: se guarda SHA-256(salt + pin).
 */

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

const store = {
  get(key) { return localStorage.getItem(key); },
  set(key, val) { localStorage.setItem(key, val); },
  remove(key) { localStorage.removeItem(key); },
  getJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  setJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};

const KEYS = {
  salt: 'qld_salt',
  pinHash: 'qld_pinHash',
  accounts: 'qld_accounts',
  attempts: 'qld_failedAttempts',
  lockUntil: 'qld_lockUntil',
};

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes.buffer);
}

const AVATAR_COLORS = ['#5b47e0', '#e0475b', '#2fa36b', '#e08a2f', '#2f8fe0', '#a02fe0'];

function colorForName(name) {
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initialsFor(name) {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

/* ---------- Screen switching ---------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/* ---------- Generic PIN pad builder ---------- */

function buildKeypad(container, onDigit, onBackspace) {
  container.innerHTML = '';
  const layout = ['1','2','3','4','5','6','7','8','9','','0','back'];
  for (const key of layout) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (key === '') {
      btn.className = 'key empty';
    } else if (key === 'back') {
      btn.className = 'key backspace';
      btn.textContent = '⌫';
      btn.addEventListener('click', onBackspace);
    } else {
      btn.className = 'key';
      btn.textContent = key;
      btn.addEventListener('click', () => onDigit(key));
    }
    container.appendChild(btn);
  }
}

function renderDots(container, length, filled) {
  container.innerHTML = '';
  for (let i = 0; i < length; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < filled ? ' filled' : '');
    container.appendChild(dot);
  }
}

/* ---------- Setup PIN (first run) ---------- */

const setupDots = document.getElementById('setup-dots');
const setupKeypad = document.getElementById('setup-keypad');
const setupSubtitle = document.getElementById('setup-subtitle');

let setupStage = 'create'; // 'create' -> 'confirm'
let firstPin = '';
let currentInput = '';

function renderSetup() {
  renderDots(setupDots, PIN_LENGTH, currentInput.length);
}

async function handleSetupDigit(d) {
  if (currentInput.length >= PIN_LENGTH) return;
  currentInput += d;
  renderSetup();
  if (currentInput.length === PIN_LENGTH) {
    if (setupStage === 'create') {
      firstPin = currentInput;
      currentInput = '';
      setupStage = 'confirm';
      setupSubtitle.textContent = 'Confirma tu PIN';
      setTimeout(renderSetup, 120);
    } else {
      if (currentInput === firstPin) {
        const salt = randomSalt();
        const hash = await sha256Hex(salt + currentInput);
        store.set(KEYS.salt, salt);
        store.set(KEYS.pinHash, hash);
        store.setJSON(KEYS.accounts, []);
        goToAddAccount(true);
      } else {
        setupSubtitle.textContent = 'No coincide, intenta de nuevo';
        setupStage = 'create';
        firstPin = '';
        currentInput = '';
        setTimeout(renderSetup, 120);
      }
    }
  }
}

function handleSetupBackspace() {
  currentInput = currentInput.slice(0, -1);
  renderSetup();
}

buildKeypad(setupKeypad, handleSetupDigit, handleSetupBackspace);

/* ---------- Unlock with PIN ---------- */

const unlockDots = document.getElementById('unlock-dots');
const unlockKeypad = document.getElementById('unlock-keypad');
const unlockError = document.getElementById('unlock-error');
let unlockInput = '';
let unlockLocked = false;

function renderUnlock() {
  renderDots(unlockDots, PIN_LENGTH, unlockInput.length);
}

async function handleUnlockDigit(d) {
  if (unlockLocked || unlockInput.length >= PIN_LENGTH) return;
  unlockInput += d;
  renderUnlock();
  if (unlockInput.length === PIN_LENGTH) {
    const salt = store.get(KEYS.salt);
    const hash = await sha256Hex(salt + unlockInput);
    const savedHash = store.get(KEYS.pinHash);
    if (hash === savedHash) {
      store.set(KEYS.attempts, '0');
      unlockError.classList.add('hidden');
      unlockInput = '';
      goToChooser();
    } else {
      unlockInput = '';
      const attempts = Number(store.get(KEYS.attempts) || '0') + 1;
      store.set(KEYS.attempts, String(attempts));
      renderUnlock();
      if (attempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        store.set(KEYS.lockUntil, String(until));
        startLockCountdown(until);
      } else {
        unlockError.textContent = `PIN incorrecto (intento ${attempts}/${MAX_ATTEMPTS})`;
        unlockError.classList.remove('hidden');
      }
    }
  }
}

function handleUnlockBackspace() {
  unlockInput = unlockInput.slice(0, -1);
  renderUnlock();
}

buildKeypad(unlockKeypad, handleUnlockDigit, handleUnlockBackspace);

function startLockCountdown(until) {
  unlockLocked = true;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    if (remaining <= 0) {
      unlockLocked = false;
      store.set(KEYS.attempts, '0');
      store.remove(KEYS.lockUntil);
      unlockError.classList.add('hidden');
      return;
    }
    unlockError.textContent = `Demasiados intentos. Espera ${remaining}s`;
    unlockError.classList.remove('hidden');
    setTimeout(tick, 500);
  };
  tick();
}

document.getElementById('btn-reset-pin').addEventListener('click', () => {
  if (!confirm('Esto borrará el PIN y las cuentas guardadas en este dispositivo (solo demo). ¿Continuar?')) return;
  Object.values(KEYS).forEach(k => store.remove(k));
  location.reload();
});

/* ---------- Account chooser ---------- */

const accountList = document.getElementById('account-list');
let pendingAccountLogin = null;

function goToChooser() {
  const accounts = store.getJSON(KEYS.accounts, []);
  accountList.innerHTML = '';
  accounts.forEach(acc => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'account-item';
    btn.innerHTML = `
      <span class="avatar" style="background:${acc.avatarColor}">${initialsFor(acc.name)}</span>
      <span class="account-text"><strong>${acc.name}</strong><small>${acc.providerLabel}</small></span>
    `;
    btn.addEventListener('click', () => loginWithAccount(acc));
    li.appendChild(btn);
    accountList.appendChild(li);
  });
  showScreen('screen-chooser');
}

document.getElementById('btn-add-account').addEventListener('click', () => goToAddAccount(false));
document.getElementById('btn-lock-again').addEventListener('click', lockDevice);
document.getElementById('btn-lock-home').addEventListener('click', lockDevice);
document.getElementById('btn-switch-account').addEventListener('click', goToChooser);

function lockDevice() {
  unlockInput = '';
  unlockError.classList.add('hidden');
  renderUnlock();
  showScreen('screen-unlock');
}

/* ---------- Add account (provider picker) ---------- */

const PROVIDER_INFO = {
  google: { label: 'Cuenta de Google', title: 'Continuar con Google', icon: 'G', color: '#ea4335', placeholder: 'ana.perez@gmail.com' },
  microsoft: { label: 'Cuenta de Microsoft', title: 'Continuar con Microsoft', icon: 'M', color: '#00a4ef', placeholder: 'ana.perez@outlook.com' },
  other: { label: 'Otra cuenta', title: 'Usar otro correo', icon: '@', color: '#6b6b80', placeholder: 'tu-correo@ejemplo.com' },
};

let firstRunAfterSetup = false;

function goToAddAccount(isFirstRun) {
  firstRunAfterSetup = isFirstRun;
  showScreen('screen-add');
}

document.querySelectorAll('.provider-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const provider = btn.dataset.provider;
    openConsent(provider);
  });
});

document.getElementById('btn-cancel-add').addEventListener('click', () => {
  if (firstRunAfterSetup) goToChooser();
  else goToChooser();
});

/* ---------- Consent (simulated OAuth) ---------- */

const consentIcon = document.getElementById('consent-icon');
const consentTitle = document.getElementById('consent-title');
const consentSubtitle = document.getElementById('consent-subtitle');
const consentInput = document.getElementById('consent-input');
let consentProvider = null;

function openConsent(provider) {
  consentProvider = provider;
  const info = PROVIDER_INFO[provider];
  consentIcon.textContent = info.icon;
  consentIcon.style.background = info.color;
  consentTitle.textContent = info.title;
  consentSubtitle.textContent = '(Simulado) Ingresa un nombre o correo para esta cuenta de prueba';
  consentInput.value = '';
  consentInput.placeholder = info.placeholder;
  showScreen('screen-consent');
  consentInput.focus();
}

document.getElementById('btn-cancel-consent').addEventListener('click', () => goToAddAccount(firstRunAfterSetup));

document.getElementById('btn-confirm-consent').addEventListener('click', () => {
  const value = consentInput.value.trim() || PROVIDER_INFO[consentProvider].placeholder;
  const info = PROVIDER_INFO[consentProvider];
  const account = {
    id: crypto.randomUUID(),
    name: value,
    provider: consentProvider,
    providerLabel: info.label,
    avatarColor: colorForName(value),
  };
  const accounts = store.getJSON(KEYS.accounts, []);
  accounts.push(account);
  store.setJSON(KEYS.accounts, accounts);
  loginWithAccount(account);
});

/* ---------- Home (logged in) ---------- */

const homeAvatar = document.getElementById('home-avatar');
const homeTitle = document.getElementById('home-title');
const homeSubtitle = document.getElementById('home-subtitle');

function loginWithAccount(account) {
  homeAvatar.textContent = initialsFor(account.name);
  homeAvatar.style.background = account.avatarColor;
  homeTitle.textContent = `¡Hola, ${account.name}!`;
  homeSubtitle.textContent = `Iniciaste sesión con ${account.providerLabel.toLowerCase()} sin escribir contraseña.`;
  showScreen('screen-home');
}

/* ---------- Boot ---------- */

function boot() {
  const hasPin = !!store.get(KEYS.pinHash);
  if (!hasPin) {
    showScreen('screen-setup');
    renderSetup();
    return;
  }
  const lockUntil = Number(store.get(KEYS.lockUntil) || '0');
  showScreen('screen-unlock');
  renderUnlock();
  if (lockUntil > Date.now()) startLockCountdown(lockUntil);
}

boot();
