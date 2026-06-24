// Shared types for the TUI

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
