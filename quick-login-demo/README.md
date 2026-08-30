# Quick Login — inicio de sesión rápido con PIN

Prototipo web de un inicio de sesión más rápido que el típico "usuario +
contraseña": el dispositivo pide **un PIN** una sola vez para desbloquearse
y luego muestra un **selector de cuentas** (Google, Microsoft u otra) para
entrar con un solo toque, igual que el selector de cuentas de Chrome/Android
o el desbloqueo por PIN de Windows Hello.

## Cómo probarlo

Es una página estática, no necesita backend ni instalación:

```bash
cd quick-login-demo
python3 -m http.server 8000
# abre http://localhost:8000
```

(o simplemente abre `index.html` en el navegador).

## El algoritmo

1. **Registro del PIN (una vez por dispositivo)**
   - Se genera un `salt` aleatorio con `crypto.getRandomValues`.
   - Se calcula `hash = SHA-256(salt + PIN)` con la Web Crypto API.
   - Se guardan `salt` y `hash` en `localStorage`. **El PIN en claro nunca
     se guarda ni se envía a ningún sitio.**

2. **Desbloqueo**
   - El usuario marca su PIN en el teclado numérico.
   - Se recalcula el hash con el `salt` guardado y se compara contra el
     hash almacenado.
   - Si falla 5 veces seguidas, el dispositivo se bloquea 30 segundos
     (mitigación básica contra fuerza bruta).

3. **Selector de cuentas**
   - Tras desbloquear, se listan las cuentas ya vinculadas a este
     dispositivo (simulando lo que en un caso real serían tokens de
     sesión/credenciales guardadas, no contraseñas).
   - Elegir una cuenta inicia sesión al instante: no se vuelve a pedir
     contraseña.
   - "Usar otra cuenta" simula un flujo de tipo OAuth: eliges proveedor
     (Google, Microsoft u otro correo), pasas por una pantalla de
     "consentimiento" simulada, y la cuenta queda guardada para la próxima
     vez.

En resumen, el modelo es: **PIN local = llave del dispositivo**, y las
**cuentas = lo que hay detrás de esa llave**. Es el mismo patrón que usan
los passkeys y el desbloqueo biométrico: la autenticación fuerte (contraseña
real, OAuth) ocurre una sola vez al vincular la cuenta; después, el PIN solo
demuestra "soy el dueño de este dispositivo".

## Limitaciones (es una demo)

- Las cuentas "Google/Microsoft/otro" son **simuladas**: no hay OAuth real,
  solo pides un nombre/correo de prueba y se guarda localmente.
- `localStorage` no es un almacenamiento seguro tipo *secure enclave*;
  cualquiera con acceso al navegador puede leerlo. Sirve para demostrar el
  flujo, no para producción.
- No hay sincronización entre dispositivos: el PIN y las cuentas viven solo
  en el navegador donde se creó.

## Cómo llevarlo a producción real

Para una versión real y segura de esta misma idea, reemplaza:

- El PIN local → por **WebAuthn / Passkeys** (`navigator.credentials`) o el
  desbloqueo biométrico del sistema operativo (Face ID, huella, Windows
  Hello), que sí usan hardware seguro.
- Las cuentas simuladas → por **OAuth real** (Google Identity Services,
  Microsoft Identity Platform, etc.), con un backend que gestione tokens de
  sesión y refresh tokens de forma segura (no en `localStorage`).

## Estructura

```
quick-login-demo/
├── index.html   # las 6 pantallas del flujo
├── style.css    # estilos (tema oscuro de fondo, tarjeta central)
├── app.js       # lógica: hash del PIN, bloqueo, cuentas, navegación
└── README.md
```
