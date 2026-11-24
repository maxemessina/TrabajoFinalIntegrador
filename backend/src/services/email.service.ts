export type PasswordResetEmail = {
  recipient: string;
  token: string;
  expiresAt: Date;
};

export type EmailService = {
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
};

export function createMockEmailService(): EmailService {
  return {
    sendPasswordReset: async () => Promise.resolve(),
  };
}
