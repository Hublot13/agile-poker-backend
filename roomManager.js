import { Room } from "./models/Room.js";

class RoomManager {
  async generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async createRoom(hostSocketId, hostName, deckType = "fibonacci") {
    const code = await this.generateRoomCode();

    const room = new Room({
      code,
      hostSocketId,
      deckType,
      roundState: "idle",
      createdAt: new Date(),
      lastActivity: new Date(),
      users: [
        {
          socketId: hostSocketId,
          name: hostName,
          isHost: true,
          connected: true,
          joinedAt: new Date(),
        },
      ],
      votes: [],
    });

    await room.save();
    return room;
  }

  async reconnectUser(roomCode, socketId, userName) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) throw new Error("Room not found");

    const existingUser = room.users.find((u) => u.name === userName);

    if (existingUser) {
      existingUser.socketId = socketId;
      existingUser.connected = true;
      if (existingUser.isHost) room.hostSocketId = socketId;
    } else {
      room.users.push({
        socketId,
        name: userName,
        isHost: false,
        connected: true,
        joinedAt: new Date(),
      });
    }

    room.lastActivity = new Date();
    await room.save();

    return {
      room,
      isReconnection: !!existingUser,
      userVote: room.votes.find((v) => v.userName === userName)?.value,
    };
  }

  async leaveRoom(socketId) {
    const room = await Room.findOne({ "users.socketId": socketId });
    if (!room) return null;

    const user = room.users.find((u) => u.socketId === socketId);
    if (!user) return null;

    const wasHost = user.isHost;

    user.connected = false;
    user.isHost = false;
    room.votes = room.votes.filter((v) => v.userName !== user.name);
    room.lastActivity = new Date();

    const connectedUsers = room.users.filter((u) => u.connected);

    if (wasHost && connectedUsers.length > 0) {
      connectedUsers[0].isHost = true;
      room.hostSocketId = connectedUsers[0].socketId;
    }

    if (connectedUsers.length === 0) {
      await Room.deleteOne({ code: room.code });
      return { room: null, user, roomCode: room.code, wasHost };
    }

    await room.save();
    return { room, user, roomCode: room.code, wasHost };
  }

  async vote(roomCode, socketId, vote) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) throw new Error("Room not found");

    const user = room.users.find((u) => u.socketId === socketId);
    if (!user) throw new Error("User not found");

    if (room.roundState !== "voting") throw new Error("Voting not active");

    room.votes = room.votes.filter((v) => v.userName !== user.name);
    room.votes.push({ userName: user.name, value: vote });
    room.lastActivity = new Date();

    await room.save();
    return room;
  }

  async startVoting(roomCode, hostSocketId) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) throw new Error("Room not found");
    if (room.hostSocketId !== hostSocketId)
      throw new Error("Only host can start");

    room.roundState = "voting";
    room.votes = [];
    room.lastActivity = new Date();
    await room.save();

    return room;
  }

  async revealVotes(roomCode, hostSocketId) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) throw new Error("Room not found");
    if (room.hostSocketId !== hostSocketId)
      throw new Error("Only host can reveal");

    room.roundState = "revealed";
    room.lastActivity = new Date();
    await room.save();

    return room;
  }

  async resetRound(roomCode, hostSocketId) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) throw new Error("Room not found");
    if (room.hostSocketId !== hostSocketId)
      throw new Error("Only host can reset");

    room.roundState = "idle";
    room.votes = [];
    room.lastActivity = new Date();
    await room.save();

    return room;
  }

  async getRoomStats(roomCode) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) return null;

    const connected = room.users.filter((u) => u.connected);
    const votes = room.votes.map((v) => v.value).filter((v) => v != null);

    let average = null;
    if (room.roundState === "revealed" && votes.length > 0) {
      const nums = votes.map(Number).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        average =
          Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
      }
    }

    return {
      totalUsers: connected.length,
      votedUsers: votes.length,
      average,
      votes:
        room.roundState === "revealed"
          ? Object.fromEntries(room.votes.map((v) => [v.userName, v.value]))
          : null,
    };
  }
  async getUserSession(socketId) {
    const room = await Room.findOne({ "users.socketId": socketId });
    if (!room) return null;

    const user = room.users.find((u) => u.socketId === socketId);
    if (!user) return null;

    return {
      roomCode: room.code,
      userName: user.name,
    };
  }

  async cleanupInactiveRooms() {
    const cutoff = new Date(Date.now() - 15 * 1000);
    const result = await Room.deleteMany({
      lastActivity: { $lt: cutoff },
      users: { $not: { $elemMatch: { connected: true } } },
    });
    console.log(`🧹 Cleaned ${result.deletedCount} inactive rooms`);
  }

  async makeHost(roomCode, newHostSocketId) {
    const room = await Room.findOne({ code: roomCode });
    if (!room) throw new Error("Room not found");

    const currentHost = room.users.find((u) => u.isHost);
    console.log(`SOKCET ID OF NEW HOST ${newHostSocketId}`)
    const newHost = room.users.find((u) => u.socketId === newHostSocketId);
    if (!newHost) throw new Error("User not found");


    if (currentHost) currentHost.isHost = false;
    newHost.isHost = true;

    room.hostSocketId = newHost.socketId;
    room.lastActivity = new Date();

    await room.save();
    return room;
  }
}

export const roomManager = new RoomManager();
