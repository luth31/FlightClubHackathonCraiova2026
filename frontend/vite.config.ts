import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
const dockerDev=process.env.AERODESK_DOCKER_DEV==='true';
const apiTarget=process.env.AERODESK_API_PROXY_TARGET||'http://127.0.0.1:8000';

export default defineConfig({
  plugins:[react()],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  server:{
    port:5173,
    watch:dockerDev?{usePolling:true,interval:300}:undefined,
    proxy:{
      // Keep gateway-only exchange endpoints off the Docker browser entry point.
      ...(dockerDev?{'/api/exchange/':{target:apiTarget,bypass:()=>false as const}}:{}),
      '/api':{target:apiTarget},
    },
  },
});
