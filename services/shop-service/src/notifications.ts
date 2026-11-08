// Mock e-mails: written to the log instead of being sent.
// In production this is where an e-mail provider (SES, SendGrid, ...) would be called.
import { logger } from "./logger";

export const notify = {
  paymentReceived(email: string, orderId: number, amount: number) {
    logger.info({ to: email, orderId, amount }, `[mock email] Payment received for order #${orderId}`);
  },
  orderShipped(email: string, orderId: number) {
    logger.info({ to: email, orderId }, `[mock email] Your order #${orderId} has shipped`);
  },
};
