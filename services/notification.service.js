import { sendNotifications } from "../getNotifs";

class NotificationService {
  sendWatchlistUpdate(userId, ticker, action = 'added') {
    try {
      sendNotifications(
        'watchlist-updated',
        {
          message: `Watchlist updated: ${ticker} ${action}`,
        },
        userId
      );
    } catch (err) {
      console.error(' Failed to send notification:', err.message);
    }
  }
}

export default new NotificationService();