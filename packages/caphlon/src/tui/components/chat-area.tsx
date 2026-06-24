import { Box, Text } from 'ink';
import type { Message } from './types.js';

interface ChatAreaProps {
  messages: Message[];
}

export function ChatArea({ messages }: ChatAreaProps) {
  if (messages.length === 0) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        <Box marginTop={1}>
          <Text dimColor>╔══════════════════════════════════════════╗</Text>
        </Box>
        <Box>
          <Text dimColor>║     Welcome to ⚡ Caphlon v0.1.0!        ║</Text>
        </Box>
        <Box>
          <Text dimColor>╚══════════════════════════════════════════╝</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Type a message to get started.</Text>
        </Box>
        <Box>
          <Text dimColor>Type /help for available commands.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1}>
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
    </Box>
  );
}

function MessageBubble(props: { message: Message; key?: number }) {
  const { message } = props;
  if (message.role === 'user') {
    return (
      <Box marginY={0}>
        <Text bold color="#6366f1">
          {'▶ '}
        </Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  if (message.role === 'system') {
    return (
      <Box marginY={0}>
        <Text dimColor>{message.content}</Text>
      </Box>
    );
  }

  return (
    <Box marginY={0} flexDirection="column">
      <Text bold color="#a855f7">
        {'⚡ Caphlon'}
      </Text>
      <Text>{message.content}</Text>
    </Box>
  );
}
