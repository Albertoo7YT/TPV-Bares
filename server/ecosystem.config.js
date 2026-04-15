import { fileURLToPath } from "node:url";

const serverDirectory = fileURLToPath(new URL(".", import.meta.url));

export default {
  apps: [
    {
      name: "tpv-server",
      script: "./dist/index.js",
      cwd: serverDirectory,
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      log_file: "/var/log/tpv/server.log",
      error_file: "/var/log/tpv/error.log",
      time: true,
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
