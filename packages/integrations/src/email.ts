export interface EmailMessage {
  idempotencyKey?: string;
  to: string;
  from?: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailDeliveryResult {
  messageId: string;
  delivered: boolean;
  timestamp: string;
  recipient: string;
  isDuplicate?: boolean;
}

export class EmailService {
  private sentMessages = new Map<string, EmailDeliveryResult>();

  /**
   * Dispatches email with idempotency safeguard
   */
  public async sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    if (!message.to || !message.subject) {
      throw new Error('Email recipient and subject are required.');
    }

    // Check duplicate delivery
    if (message.idempotencyKey && this.sentMessages.has(message.idempotencyKey)) {
      const existing = this.sentMessages.get(message.idempotencyKey)!;
      return {
        ...existing,
        isDuplicate: true
      };
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const result: EmailDeliveryResult = {
      messageId,
      delivered: true,
      timestamp: new Date().toISOString(),
      recipient: message.to
    };

    if (message.idempotencyKey) {
      this.sentMessages.set(message.idempotencyKey, result);
    }

    return result;
  }
}

export const defaultEmailService = new EmailService();
