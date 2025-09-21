import { getIo , getUserSocket } from "./socket.js";

export function sendNotifications(event, payload, userId = null) {
    const io = getIo();

    if (userId) {
        const socketId = getUserSocket(userId);
        if (socketId) {
            io.to(socketId).emit(event,payload)
        }
    } else {
        io.emit(event,payload)
    }
}