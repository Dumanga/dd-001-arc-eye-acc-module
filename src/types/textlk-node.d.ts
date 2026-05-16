declare module "textlk-node" {
  export type SendSmsInput = {
    phoneNumber: string;
    message: string;
    apiToken?: string;
    senderId?: string;
  };

  export function sendSMS(input: SendSmsInput): Promise<unknown>;
}

