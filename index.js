import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import { roomManager } from "./roomManager.js";
import { setupSocketHandlers } from "./socketHandlers.js";
import dotenv from "dotenv";

// Load local .env only if not in production
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.local" });
}

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("📦 MongoDB connected");
  })
  .catch((err) => console.error("MongoDB error", err));

app.get("/health", async (req, res) => {
  const count = await mongoose.connection.db
    .collection("rooms")
    .countDocuments();
  console.log(
    `[${new Date().toISOString()}] /health ping received. Current room count: ${count}`
  );
  res.json({ status: "ok", roomCount: count });
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Cleanup interval only in production
// if (process.env.NODE_ENV === "production") {
//   setInterval(() => {
//     roomManager.cleanupInactiveRooms();
//   }, 15 * 1000);
// }
