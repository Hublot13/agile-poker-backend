import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    socketId: String,
    name: String,
    isHost: Boolean,
    connected: Boolean,
    joinedAt: Date,
  },
  { _id: false }
);

const voteSchema = new mongoose.Schema(
  {
    userName: String,
    value: String,
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  hostSocketId: String,
  deckType: String,
  roundState: String,
  createdAt: Date,
  lastActivity: Date,
  users: [userSchema],
  votes: [voteSchema],
});

export const Room = mongoose.model("Room", roomSchema);
