import { Server } from "socket.io";

let io;
const userSockets = new Map();

export function initSocket(server,origins) {
    io = new Server(server , {
        cors:{origin:["http://localhost:5173",'https://stocks-server-kcro.onrender.com']}
    })

    io.on("connection", (socket) => {
        console.log("User connected");
        const userId = socket.handshake.query.userId;
        if (userId) {
            userSockets.set(userId,socket.id)
        }
        socket.on("disconnect", () => {
            if (userId) {
                userSockets.delete(userId)
            }
            console.log("User disconnected");
        })
    })

    return io
}

export function getIo() {
    if (!io) throw new Error("Socket.io not initialized!")
    return io
}

export function getUserSocket(userId) {
    return userSockets.get(userId)
}