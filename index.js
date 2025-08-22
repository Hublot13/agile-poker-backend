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

app.get("/health", (req, res) => {
  const indianTime = new Date()
    .toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    })
    .replace(",", "");

  console.log(`[${indianTime}] /health ping received.`);

  res.json({ status: "ok" });
});


app.get("/cleanupDB", async (req, res) => {
  const indianTime = new Date()
    .toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    })
    .replace(",", "");

  console.log(`[${indianTime}] /cleanupDB call received. Initiating cleanup.`);

  try {
    const deletedRooms = await roomManager.cleanupInactiveRooms();
    deletedRooms.forEach((roomCode) => {
      io.to(roomCode).emit("removed");
    });
    res.json({
      status: "success",
      message: `Cleaned up ${deletedRooms.length} inactive rooms.`,
      deletedRooms: deletedRooms,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
