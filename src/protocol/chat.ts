export const chatTextLimit = 240;
export const chatHistoryLimit = 50;

export interface ChatMessage {
  id: string;
  name: string;
  color: string;
  text: string;
}

export type ChatEvent =
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'message'; message: ChatMessage };
