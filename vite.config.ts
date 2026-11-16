import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Aşama 287: kitaplıklar (React, Supabase) uygulama kodundan AYRI dosyalara bölünür. Bu dosyaların adı içerik
    // değişmedikçe aynı kalır ve tarayıcıda kalıcı önbelleklidir; yeni paket kurulduğunda kullanıcı yalnız
    // değişen uygulama dosyasını indirir, kitaplıkları yeniden indirmez. Davranış değişmez.
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'kitaplik-react';
            if (/node_modules\/(@supabase|iceberg-js|tslib)\//.test(id)) return 'kitaplik-supabase';
            return undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
