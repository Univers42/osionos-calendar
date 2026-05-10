import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const calendarBridgeTarget = process.env.VITE_CALENDAR_BRIDGE_URL || 'http://localhost:4200';

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(__dirname, 'node_modules/.vite'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3003,
    strictPort: true,
    proxy: {
      '/auth': calendarBridgeTarget,
      '/session': calendarBridgeTarget,
      '/calendars': calendarBridgeTarget,
      '/events': calendarBridgeTarget,
      '/baas': calendarBridgeTarget,
      '/calendar/bridge': calendarBridgeTarget,
      '/api/calendar/bridge': calendarBridgeTarget,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3003,
    strictPort: true,
  },
});