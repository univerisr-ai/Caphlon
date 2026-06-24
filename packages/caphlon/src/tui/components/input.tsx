import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputAreaProps {
  onPrompt: (input: string) => void;
}

export function InputArea({ onPrompt }: InputAreaProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (input: string) => {
      if (input.trim()) {
        onPrompt(input.trim());
        setValue('');
      }
    },
    [onPrompt]
  );

  return (
    <Box borderStyle="round" borderColor="#374151" paddingX={1} marginTop={0} width="100%">
      <Text bold color="#6366f1">
        {'▶ '}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Type a message... (Ctrl+C to exit)"
        showCursor
      />
    </Box>
  );
}
