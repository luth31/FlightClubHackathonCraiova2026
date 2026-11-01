import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
const dockerDev=process.env.FLYLEAF_DOCKER_DEV==='true';
const apiTarget=process.env.FLYLEAF_API_PROXY_TARGET||'http://127.0.0.1:8000';
const demoLoginTarget=process.env.FLYLEAF_DEMO_LOGIN_TARGET;

export default defineConfig({
  cacheDir:process.env.FLYLEAF_AIRPORT_ID?`node_modules/.vite-${process.env.FLYLEAF_AIRPORT_ID.replace(/[^a-z0-9-]/gi,'')}`:undefined,
  plugins:[react()],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  server:{
    port:5173,
    watch:dockerDev?{usePolling:true,interval:300}:undefined,
    proxy:{
      ...(demoLoginTarget?{'/api/auth/login':{target:demoLoginTarget,rewrite:()=>'/auth/login'}}:{}),
      // Keep gateway-only exchange endpoints off the Docker browser entry point.
      ...(dockerDev?{'/api/exchange/':{target:apiTarget,bypass:()=>false as const}}:{}),
      '/api':{target:apiTarget},
    },
  },
});
