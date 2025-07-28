import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import { roomManager } from "./roomManager.js";
import { setupSocketHandlers } from "./socketHandlers.js";
import dotenv from "dotenv";
dotenv.config();

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
  .then(() => console.log("📦 MongoDB connected"))
  .catch((err) => console.error("MongoDB error", err));

app.get("/health", async (req, res) => {
  const count = await mongoose.connection.db
    .collection("rooms")
    .countDocuments();
  res.json({ status: "ok", roomCount: count });
});

setupSocketHandlers(io);
console.log("Loaded MONGO_URI:", process.env.TEST);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// setInterval(() => {
//   roomManager.cleanupInactiveRooms();
// }, 15 * 1000);
