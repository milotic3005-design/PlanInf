import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Privacy guard (SPEC A19): a Content-Security-Policy that forbids the page from
 * opening any network connection. `connect-src 'none'` blocks fetch, XHR,
 * WebSocket, EventSource and sendBeacon. img/font/script are limited to this
 * origin, and form-action 'none' blocks form posts, so no income data can leave
 * through those paths either.
 *
 * The production build (npm run build / preview) gets the strict policy. The dev
 * server must allow its own hot-reload WebSocket and React's inline refresh
 * script, so dev relaxes only those two directives, to localhost.
 */
function csp(): Plugin {
  const strict = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  const dev = strict.map((d) =>
    d.startsWith('connect-src')
      ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"
      : d.startsWith('script-src')
        ? "script-src 'self' 'unsafe-inline'"
        : d,
  );
  let isBuild = false;
  return {
    name: 'privacy-csp',
    configResolved(c) {
      isBuild = c.command === 'build';
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: (isBuild ? strict : dev).join('; ') },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [csp(), react(), tailwindcss()],
  server: { port: 5186, strictPort: true },
  preview: { port: 5187, strictPort: true },
});
