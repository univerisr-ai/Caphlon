import { Box, Text } from 'ink';
import type { CaphlonMode } from '../auto-mode.js';
import { modeIcon } from '../auto-mode.js';

interface StatusBarProps {
  mode: CaphlonMode;
  status: string;
}

export function StatusBar({ mode, status }: StatusBarProps) {
  return (
    <Box borderStyle="round" borderColor="#374151" paddingX={1} width="100%">
      <Box flexGrow={1}>
        <Text dimColor>
          {modeIcon(mode)} {status}
        </Text>
      </Box>
      <Box>
        <Text dimColor italic>
          /help · Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
}
