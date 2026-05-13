import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

function resolveBuildId(): string {
  const sha =
    process.env.RENDER_GIT_COMMIT ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    '';
  const short = typeof sha === 'string' && sha.length >= 7 ? sha.slice(0, 7) : '';
  return short || 'local';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          const script = `
    <script>
      (function() {
        const isViteError = (msg) =>
          msg && (
  
            msg.includes('vite') ||
            msg.includes('hmr') ||
            msg.includes('ScriptProcessorNode') ||
            msg.includes('service-worker') ||
            msg.includes('Service Worker') ||
            msg.includes('Failed to fetch') ||
            
            
            msg.includes('ScriptProcessorNode is deprecated') ||
            msg.includes('listener indicated an asynchronous response') ||
            msg.includes('message channel closed before a response was received') ||
            msg.includes('token=') ||
            msg.includes('Canceled: Canceled') ||
            msg.includes('blobstore') ||
            msg.includes('makersuite')
          );

        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason;
          const msg = (reason && (reason.message || reason.stack || String(reason))) || '';
          if (isViteError(msg)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);

        window.addEventListener('error', (event) => {
          const msg = event.message || '';
          if (isViteError(msg)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);

        const originalConsoleError = console.error;
        console.error = function() {
          const args = Array.from(arguments);
          const msg = args.join(' ');
          if (isViteError(msg)) return;
          originalConsoleError.apply(console, arguments);
        };

        const originalConsoleWarn = console.warn;
        console.warn = function() {
          const args = Array.from(arguments);
          const msg = args.join(' ');
          if (isViteError(msg)) return;
          originalConsoleWarn.apply(console, arguments);
        };

        const originalConsoleLog = console.log;
        console.log = function() {
          const args = Array.from(arguments);
          const msg = args.join(' ');
          if (isViteError(msg)) return;
          originalConsoleLog.apply(console, arguments);
        };
      })();
    </script>`;
          return html.replace('<head>', '<head>' + script);
        },
      },
    ],
    resolve: {
      alias: [
        { find: '@/types', replacement: path.resolve(__dirname, 'src/types') },
        { find: '@/components', replacement: path.resolve(__dirname, 'src/components') },
        { find: '@', replacement: path.resolve(__dirname, '.') },
      ],
    },
    define: {
      __NEBULLA_BUILD_ID__: JSON.stringify(resolveBuildId()),
      'process.env.DEV_LOCAL_AUTH': JSON.stringify(env.DEV_LOCAL_AUTH ?? ''),
      'process.env.DEV_LOCAL_GITHUB_UID': JSON.stringify(env.DEV_LOCAL_GITHUB_UID ?? ''),
      'process.env.DEV_LOCAL_GITHUB_NAME': JSON.stringify(env.DEV_LOCAL_GITHUB_NAME ?? ''),
      'process.env.DEV_LOCAL_GITHUB_EMAIL': JSON.stringify(env.DEV_LOCAL_GITHUB_EMAIL ?? ''),
      'process.env.DEV_LOCAL_GITHUB_AVATAR': JSON.stringify(env.DEV_LOCAL_GITHUB_AVATAR ?? ''),
    },
    server: {
      hmr: {
        overlay: false,
      },
    },
  };
});
