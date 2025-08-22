import { roomManager } from "./roomManager.js";

export function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`👤 User connected: ${socket.id}`);

    socket.on("create-room", async ({ hostName, deckType }, callback) => {
      try {
        const room = await roomManager.createRoom(
          socket.id,
          hostName,
          deckType
        );
        socket.join(room.code);

        console.log(`🏠 Room created: ${room.code} by ${hostName}`);

        const user = room.users.find((u) => u.socketId === socket.id);

        callback({
          success: true,
          roomCode: room.code,
          room: serializeRoom(room),
          user,
        });
      } catch (error) {
        console.error("Create room error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("join-room", async ({ roomCode, userName }, callback) => {
      try {
        const result = await roomManager.reconnectUser(
          roomCode,
          socket.id,
          userName
        );
        socket.join(roomCode);

        const user = result.room.users.find((u) => u.socketId === socket.id);
        const stats = await roomManager.getRoomStats(roomCode);

        console.log(
          `🚪 ${userName} ${
            result.isReconnection ? "reconnected to" : "joined"
          } room: ${roomCode}`
        );

        socket.to(roomCode).emit("user-joined", {
          user: serializeUser(user),
          isReconnection: result.isReconnection,
        });

        callback({
          success: true,
          room: serializeRoom(result.room),
          user: serializeUser(user),
          stats,
          userVote: result.userVote || null,
          isReconnection: result.isReconnection,
        });
      } catch (error) {
        console.error("Join room error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("start-voting", async (callback) => {
      try {
        const session = await roomManager.getUserSession(socket.id);
        if (!session) throw new Error("No active session");

        const room = await roomManager.startVoting(session.roomCode, socket.id);
        const stats = await roomManager.getRoomStats(session.roomCode);

        io.to(session.roomCode).emit("voting-started", {
          roundState: room.roundState,
        });

        callback({ success: true, stats });
        console.log(`🗳️ Voting started in room: ${session.roomCode}`);
      } catch (error) {
        console.error("Start voting error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("cast-vote", async ({ vote }, callback) => {
      try {
        const session = await roomManager.getUserSession(socket.id);
        if (!session) throw new Error("No active session");

        const room = await roomManager.vote(session.roomCode, socket.id, vote);
        const stats = await roomManager.getRoomStats(session.roomCode);

        io.to(session.roomCode).emit("vote-cast", {
          userName: session.userName,
          vote,
          stats,
        });

        callback({ success: true });
        console.log(
          `✅ ${session.userName} voted: ${vote} in room: ${session.roomCode}`
        );
      } catch (error) {
        console.error("Cast vote error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("reveal-votes", async (callback) => {
      try {
        const session = await roomManager.getUserSession(socket.id);
        if (!session) throw new Error("No active session");

        const room = await roomManager.revealVotes(session.roomCode, socket.id);
        const stats = await roomManager.getRoomStats(session.roomCode);

        io.to(session.roomCode).emit("votes-revealed", {
          roundState: room.roundState,
          votes: stats.votes,
          average: stats.average,
          stats,
        });

        callback({ success: true });
        console.log(`👁️ Votes revealed in room: ${session.roomCode}`);
      } catch (error) {
        console.error("Reveal votes error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("reset-round", async (callback) => {
      try {
        const session = await roomManager.getUserSession(socket.id);
        if (!session) throw new Error("No active session");

        const room = await roomManager.resetRound(session.roomCode, socket.id);

        io.to(session.roomCode).emit("round-reset", {
          roundState: room.roundState,
        });

        callback({ success: true });
        console.log(`🔄 Round reset in room: ${session.roomCode}`);
      } catch (error) {
        console.error("Reset round error:", error);
        callback({ success: false, error: error.message });
      }
    });
    socket.on("leave-room", async (callback) => {
      try {
        const result = await roomManager.leaveRoom(socket.id);

        if (result) {
          const { room, user, roomCode, wasHost } = result;

          if (user && room) {
            const stats = await roomManager.getRoomStats(roomCode);
            io.to(roomCode).emit("room-updated", room);
            let newHost = null;
            if (wasHost) {
              newHost =
                room.users.find((u) => u.socketId === room.hostSocketId)
                  ?.name || null;
            }

            socket.to(roomCode).emit("user-left", {
              userName: user.name,
              stats,
              newHost,
            });

            console.log(`🚪 ${user.name} left room: ${roomCode}`);
            // If room is empty, delete it
          }
        }

        if (callback) callback({ success: true });
      } catch (error) {
        console.error("Leave room error:", error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    socket.on("make-host", async ({ targetSocketId }, callback) => {
      try {
        const session = await roomManager.getUserSession(socket.id);
        if (!session) throw new Error("No active session");

        const room = await roomManager.makeHost(
          session.roomCode,
          targetSocketId
        );
        const newHostName = room.users.find(
          (u) => u.socketId === targetSocketId
        )?.name;
        // Emit room updated with newHostName
        io.to(session.roomCode).emit("room-updated", {
          ...serializeRoom(room),
          newHostName: newHostName,
        });

        console.log(
          `👑 ${newHostName} is now the host of room ${session.roomCode}`
        );
        callback({ success: true });
      } catch (error) {
        console.error("Make host error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("remove-user", async ({ targetSocketId }, callback) => {
      try {
        const result = await roomManager.leaveRoom(targetSocketId);
        if (result) {
          const { room, user, roomCode } = result;

          // Notify only the removed user
          io.to(targetSocketId).emit("removed");

          // Emit updated room state to all remaining users
          const updatedRoom = serializeRoom(room); // make sure this filters out disconnected users
          io.to(roomCode).emit("room-updated", updatedRoom);

          console.log(`🚪 ${user.name} was removed from room ${roomCode}`);
        }

        callback({ success: true });
      } catch (error) {
        console.error("Remove user error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("disconnect", async () => {
      const result = await roomManager.leaveRoom(socket.id);

      if (result) {
        const { room, user, roomCode } = result;

        if (user && room) {
          const stats = await roomManager.getRoomStats(roomCode);
          const newHost =
            room.users.find((u) => u.socketId === room.hostSocketId)?.name ||
            null;

          socket.to(roomCode).emit("user-left", {
            userName: user.name,
            stats,
            newHost,
          });

          console.log(`👋 ${user.name} disconnected from room: ${roomCode}`);
        }
      }

      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });
}

function serializeRoom(room) {
  return {
    code: room.code,
    deckType: room.deckType,
    roundState: room.roundState,
    users: room.users.filter((u) => u.connected).map(serializeUser),
    hostSocketId: room.hostSocketId,
  };
}

function serializeUser(user) {
  return {
    socketId: user.socketId,
    name: user.name,
    isHost: user.isHost,
    connected: user.connected,
  };
}
