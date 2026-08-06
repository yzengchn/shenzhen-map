import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true, // 端口被占用时直接报错，不自动换端口
  },
});
