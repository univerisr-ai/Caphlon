import { useState, useEffect } from 'react';
import { Box } from 'ink';
import { Header } from './header.js';
import { ChatArea } from './chat-area.js';
import { InputArea } from './input.js';
import { StatusBar } from './status-bar.js';
import { detectMode, type CaphlonMode } from '../auto-mode.js';
import { loadConfig, setApiKey } from '../config.js';
import type { Message } from './types.js';

export function App() {
  const [mode, setMode] = useState<CaphlonMode>('general');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState('Ready');
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    loadConfig().then((c) => {
      if (c.apiKey) setHasApiKey(true);
    });
  }, []);

  const addMessage = (msg: Message) => {
    setMessages((prev: Message[]) => [...prev, msg]);
  };

  const handlePrompt = async (input: string) => {
    if (input.startsWith('/')) {
      await handleCommand(input);
      return;
    }

    const detected = detectMode(input);
    setMode(detected);

    addMessage({ role: 'user', content: input });
    setStatus(`${modeIcon(detected)} ${detected.toUpperCase()} — Processing...`);
    addMessage({ role: 'assistant', content: generateResponse(input, detected) });
    setStatus('Ready');
  };

  async function handleCommand(cmd: string) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/help':
      case '/h':
        addMessage({ role: 'system', content: 'Available commands:' });
        addMessage({ role: 'system', content: '  /help, /h        Show this help' });
        addMessage({ role: 'system', content: '  /mode <mode>     Switch mode (design|compose|code|analyze|general)' });
        addMessage({ role: 'system', content: '  /key <key>       Set API key' });
        addMessage({ role: 'system', content: '  /clear, /c       Clear screen' });
        addMessage({ role: 'system', content: '  /exit, /q        Exit Caphlon' });
        break;

      case '/mode': {
        const target = parts[1]?.toLowerCase() as CaphlonMode;
        const valid: CaphlonMode[] = ['design', 'compose', 'code', 'analyze', 'general'];
        if (valid.includes(target)) {
          setMode(target);
          addMessage({ role: 'system', content: `Switched to ${target.toUpperCase()} mode` });
        } else {
          addMessage({ role: 'system', content: `Unknown mode: ${target}` });
        }
        break;
      }

      case '/key': {
        const key = parts[1];
        if (key && key.length > 8) {
          await setApiKey(key);
          setHasApiKey(true);
          addMessage({ role: 'system', content: '✅ API key saved' });
        } else {
          addMessage({ role: 'system', content: 'Usage: /key <your-api-key>' });
        }
        break;
      }

      case '/clear':
      case '/c':
        setMessages([]);
        break;

      case '/exit':
      case '/q':
        process.exit(0);
        break;

      default:
        addMessage({ role: 'system', content: `Unknown command: ${command}` });
    }
  }

  return (
    <Box flexDirection="column" height="100%">
      <Header mode={mode} hasApiKey={hasApiKey} />
      <Box flexGrow={1} flexDirection="column" marginY={0}>
        <ChatArea messages={messages} />
      </Box>
      <InputArea onPrompt={handlePrompt} />
      <StatusBar mode={mode} status={status} />
    </Box>
  );
}

function modeIcon(mode: CaphlonMode): string {
  const icons: Record<CaphlonMode, string> = {
    design: '🎨', compose: '📋', code: '💻', analyze: '🔍', general: '⚡',
  };
  return icons[mode];
}

function generateResponse(prompt: string, mode: CaphlonMode): string {
  switch (mode) {
    case 'design':
      return `I'll help you design "${prompt}".\n\nRun: caphlon design prototype "${prompt}"`;
    case 'compose':
      return `I'll compose "${prompt}" for you.\n\nRun: caphlon compose start "${prompt}"`;
    case 'code':
      return `Let me help with that code task: "${prompt}".\n\nRun: caphlon run "${prompt}"`;
    case 'analyze':
      return `Analyzing: "${prompt}".\n\nI'll examine this thoroughly.`;
    default:
      return `Got it! I'll help with: "${prompt}"`;
  }
}
