import dotenv from "dotenv";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { registerSocketHandlers } from "./socket/socketHandler.js";

dotenv.config();

const port = Number(process.env.PORT ?? 3001);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";

const app = createApp(clientUrl);
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: clientUrl
  }
});

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
