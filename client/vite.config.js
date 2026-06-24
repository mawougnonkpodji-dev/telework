import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@dagrejs/dagre']
  },
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'recharts';
          if (id.includes('node_modules/reactflow') || id.includes('node_modules/@reactflow')) return 'reactflow';
          if (id.includes('node_modules/socket.io-client')) return 'socket';
        },
      },
    },
  },
})
