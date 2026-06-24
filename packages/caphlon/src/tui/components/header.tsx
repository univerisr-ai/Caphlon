import { Box, Text } from 'ink';
import type { CaphlonMode } from '../auto-mode.js';
import { modeIcon, modeLabel, modeColor } from '../auto-mode.js';

interface HeaderProps {
  mode: CaphlonMode;
  hasApiKey: boolean;
}

export function Header({ mode, hasApiKey }: HeaderProps) {
  const color = modeColor(mode);
  return (
    <Box borderStyle="round" borderColor="#374151" paddingX={1} width="100%">
      <Box flexGrow={1}>
        <Text bold color="#6366f1">
          ⚡ Caphlon{' '}
        </Text>
        <Text dimColor>v0.1.0</Text>
      </Box>
      <Box>
        <Text color={color}>
          {modeIcon(mode)} {modeLabel(mode)}
        </Text>
        <Text>  │  </Text>
        <Text color={hasApiKey ? '#22c55e' : '#f59e0b'}>
          {hasApiKey ? '🔑 Key set' : '⚠ No API key'}
        </Text>
      </Box>
    </Box>
  );
}
