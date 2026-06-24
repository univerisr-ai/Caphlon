/**
 * Caphlon TUI — Auto Mode Detection
 *
 * AI-powered mode classification based on user prompt.
 * Modes: design, compose, run, code, analyze, general
 */

export type CaphlonMode = 'design' | 'compose' | 'code' | 'analyze' | 'general';

const MODE_PATTERNS: Record<CaphlonMode, RegExp[]> = {
  design: [
    /design/i, /prototype/i, /ui/i, /ux/i, /landing/i, /landing page/i,
    /make it look/i, /style/i, /css/i, /color/i, /layout/i, /animation/i,
    /figma/i, /mockup/i, /wireframe/i, /brand/i, /logo/i, /visual/i,
    /deck/i, /presentation/i, /slide/i, /image/i, /illustrat/i,
    /beautiful/i, /prettif/i, /redesign/i, /theme/i,
  ],
  compose: [
    /compose/i, /workflow/i, /pipeline/i, /build (a|an|the) /i,
    /create (a|an|the) /i, /implement/i, /feature/i, /from scratch/i,
    /full stack/i, /api (for|to|that)/i, /microservice/i, /module/i,
    /package/i, /library/i, /scaffold/i, /boilerplate/i, /project/i,
    /architecture/i, /system design/i,
  ],
  code: [
    /code/i, /write/i, /function/i, /class/i, /refactor/i, /fix/i,
    /bug/i, /error/i, /debug/i, /issue/i, /crash/i, /broken/i,
    /test/i, /unit test/i, /lint/i, /compile/i, /type error/i,
    /performance/i, /optimize/i, /migration/i, /upgrade/i,
    /convert/i, /transform/i, /parse/i, /regex/i,
  ],
  analyze: [
    /analyze/i, /review/i, /explain/i, /what does/i, /how does/i,
    /understand/i, /document/i, /research/i, /investigat/i,
    /compare/i, /vs/i, /versus/i, /pros and cons/i, /evaluate/i,
    /summarize/i, /audit/i, /security/i, /vulnerability/i,
    /dependenc/i, /bundle/i, /size/i, /complexity/i,
  ],
  general: [],
};

export function detectMode(prompt: string): CaphlonMode {
  const scores: Record<CaphlonMode, number> = {
    design: 0,
    compose: 0,
    code: 0,
    analyze: 0,
    general: 0,
  };

  for (const [mode, patterns] of Object.entries(MODE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        scores[mode as CaphlonMode] += 1;
      }
    }
  }

  // Longer prompts with more context → more likely compose
  if (prompt.split(' ').length > 20) {
    scores.compose += 1;
  }

  let bestMode: CaphlonMode = 'general';
  let bestScore = 0;

  for (const [mode, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode as CaphlonMode;
    }
  }

  return bestMode;
}

export function modeIcon(mode: CaphlonMode): string {
  switch (mode) {
    case 'design': return '🎨';
    case 'compose': return '📋';
    case 'code': return '💻';
    case 'analyze': return '🔍';
    case 'general': return '⚡';
  }
}

export function modeLabel(mode: CaphlonMode): string {
  switch (mode) {
    case 'design': return 'DESIGN';
    case 'compose': return 'COMPOSE';
    case 'code': return 'CODE';
    case 'analyze': return 'ANALYZE';
    case 'general': return 'GENERAL';
  }
}

export function modeColor(mode: CaphlonMode): string {
  switch (mode) {
    case 'design': return '#a855f7';   // purple
    case 'compose': return '#6366f1';  // indigo
    case 'code': return '#22c55e';     // green
    case 'analyze': return '#f59e0b';  // amber
    case 'general': return '#3b82f6';  // blue
  }
}
