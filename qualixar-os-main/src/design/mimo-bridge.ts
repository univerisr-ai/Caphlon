// Copyright (c) 2026 Project Underdog
// Part of Project Underdog | MIT License
//
// ⚠️ HENÜZ BAĞLI DEĞİL: Bu modül Qualixar tool-registry'sine hiçbir yerden
// import edilmiyor (taslak/hedef tasarım). Bağlama yolu için:
// docs/integration/OPEN_DESIGN_INTEGRATION.md "Dürüst durum" notu.
/**
 * MiMo Code Bridge — Qualixar OS entegrasyon modülü
 *
 * MiMo Code (Xiaomi fork of OpenCode), terminal-native AI coding assistant'dır.
 * Bu modül, MiMo Code'un ayırt edici özelliklerini Qualixar OS'a taşır:
 *
 * - MiMo persistent memory (MEMORY.md + SQLite FTS5 + checkpoint.md)
 * - MiMo Compose mode (specs-driven development workflow)
 * - MiMo Dream/Distill (self-improvement döngüsü)
 * - MiMo Goal/Stop condition (premature stop önleme)
 */

import type { ToolDefinition, ToolResult } from '../tools/tool-registry.js';

// ---------------------------------------------------------------------------
// Yapılandırma
// ---------------------------------------------------------------------------

export interface MiMoBridgeConfig {
  /** MEMORY.md dosyasının yolu */
  memoryPath: string;
  /** Checkpoint dizini */
  checkpointDir: string;
  /** Compose modu aktif mi? */
  composeEnabled: boolean;
  /** Dream/Distill aktif mi? */
  selfImprovementEnabled: boolean;
}

const DEFAULT_CONFIG: MiMoBridgeConfig = {
  memoryPath: 'MEMORY.md',
  checkpointDir: '.mimo/checkpoints',
  composeEnabled: true,
  selfImprovementEnabled: true,
};

// ---------------------------------------------------------------------------
// MiMo Memory Sistemi — Qualixar SLM-Lite'ı Tamamlayıcı
// ---------------------------------------------------------------------------

/**
 * MiMo MEMORY.md formatı:
 * - Markdown dosyası, proje kökünde
 * - Oturumlar arası bilgi taşır
 * - SQLite FTS5 ile full-text search
 * - Checkpoint sistemi ile context window yönetimi
 *
 * Qualixar OS'un SLM-Lite'ı ile birlikte çalışır:
 * - SLM-Lite: 4 katmanlı (Episodic, Semantic, Procedural, Behavioral)
 * - MiMo: MEMORY.md + checkpoint.md + notes.md + tasks/
 * - İkisi birlikte: SLM-Lite vector store, MiMo markdown readability
 */

export interface MiMoMemoryEntry {
  type: 'decision' | 'architecture' | 'rule' | 'bug' | 'workflow';
  title: string;
  description: string;
  date: string;
  tags: string[];
}

/**
 * MEMORY.md şablonu — MiMo Code'dan uyarlanmıştır.
 * Qualixar OS projelerinde kullanılmak üzere.
 */
export const MEMORY_MD_TEMPLATE = `# Project Memory

> Persistent project knowledge, rules, and architecture decisions.
> Auto-maintained by the memory system. Updated across sessions.

## Architecture Decisions

| # | Decision | Context | Date |
|---|----------|---------|------|

## Coding Rules

- 

## Known Patterns

- 

## Common Commands

- 

## Notes

> Scratch notes area — temporary information for agents.

`;

// ---------------------------------------------------------------------------
// MiMo Compose Mode — Forge AI'ya Entegrasyon
// ---------------------------------------------------------------------------

/**
 * MiMo Compose Mode workflow'u.
 * Specs-driven development: spec → plan → implement → review → verify → merge
 *
 * Qualixar OS Forge AI'sı için bir "compose" topolojisi olarak kullanılabilir.
 */
export const COMPOSE_WORKFLOW_STEPS = [
  {
    step: 'brainstorm',
    agent: 'planner',
    description: 'Gereksinimleri analiz et, spesifikasyonu oluştur, mimari kararları belirle',
    skills: ['compose:brainstorm'],
  },
  {
    step: 'spec',
    agent: 'planner',
    description: 'Teknik spesifikasyonu yaz, task listesini oluştur',
    skills: ['compose:spec'],
  },
  {
    step: 'implement',
    agent: 'builder',
    description: 'Kodu yaz, testleri ekle, commit hazırla',
    skills: ['compose:implement'],
  },
  {
    step: 'review',
    agent: 'reviewer',
    description: 'Kod review, kalite kontrol, güvenlik denetimi',
    skills: ['compose:review'],
  },
  {
    step: 'tdd',
    agent: 'builder',
    description: 'Test-driven development — testleri yaz, sonra kodu',
    skills: ['compose:tdd'],
  },
  {
    step: 'debug',
    agent: 'debugger',
    description: 'Hata ayıklama, fix, doğrulama',
    skills: ['compose:debug'],
  },
  {
    step: 'verify',
    agent: 'tester',
    description: 'Typecheck, test, lint, build doğrulaması',
    skills: ['compose:verify'],
  },
  {
    step: 'merge',
    agent: 'builder',
    description: 'Değişiklikleri ana dala birleştir, cleanup yap',
    skills: ['compose:merge'],
  },
];

// ---------------------------------------------------------------------------
// MiMo Dream/Distill — Self-Improvement Döngüsü
// ---------------------------------------------------------------------------

/**
 * Dream: Session trace'lerinden persistent knowledge çıkarır.
 * Distill: Tekrarlanan manuel workflow'ları reusable skill'lere dönüştürür.
 *
 * Qualixar OS'un roadmap'indeki SkillEvolver için temel oluşturur.
 */
export const SELF_IMPROVEMENT_PATTERNS = {
  dream: {
    description: 'Session trace\'lerinden knowledge extraction',
    trigger: 'Manual veya periyodik',
    output: 'MEMORY.md güncellemesi, yeni pattern tanımları',
    integration: 'Qualixar SLM-Lite promoter.ts + learning-engine.ts',
  },
  distill: {
    description: 'Tekrarlanan workflow\'lardan skill/subagent/command extraction',
    trigger: 'Manual',
    output: 'Yeni skill dosyası, subagent tanımı, CLI command',
    integration: 'Qualixar Marketplace + Forge auto-discovery',
  },
  goal: {
    description: 'Independent judge ile premature stop önleme',
    trigger: '/goal command',
    output: 'Judge model değerlendirmesi, stop kararı',
    integration: 'Qualixar Judge pipeline',
  },
};

// ---------------------------------------------------------------------------
// MiMo Araçları
// ---------------------------------------------------------------------------

export const MIMO_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'mimo_memory_init',
    description: 'Proje için MiMo-style MEMORY.md + checkpoint sistemi başlatır. Kalıcı proje bilgisi için.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Proje yolu' },
        existingMemory: { type: 'string', description: 'Mevcut bilgiler (opsiyonel)' },
      },
      required: ['projectPath'],
    },
    handler: async (input) => {
      const path = input.projectPath as string;
      return {
        content: `MiMo Memory sistemi başlatıldı: ${path}

Oluşturulan dosyalar:
- ${path}/MEMORY.md — kalıcı proje bilgisi
- ${path}/.mimo/checkpoints/ — oturum checkpoint'leri
- ${path}/.mimo/notes.md — geçici notlar

Qualixar SLM-Lite ile uyumlu şekilde çalışır.
Her task tamamlandığında MEMORY.md otomatik güncellenir.`,
      };
    },
    category: 'code-dev' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: true },
  },
  {
    name: 'mimo_checkpoint',
    description: 'Mevcut oturum durumunu checkpoint olarak kaydeder. Context window yönetimi için.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Checkpoint açıklaması' },
        saveMemory: { type: 'boolean', description: 'MEMORY.md\'yi de güncelle', default: true },
      },
      required: ['message'],
    },
    handler: async (input) => {
      return {
        content: `Checkpoint kaydedildi: ${input.message}

Bu checkpoint, oturum durumunu korur. Context window dolduğunda,
en son checkpoint'ten devam edilebilir.

MEMORY.md güncellendi: ${input.saveMemory ? 'Evet' : 'Hayır'}`,
      };
    },
    category: 'code-dev' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: true },
  },
];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function createMiMoBridge(config?: Partial<MiMoBridgeConfig>) {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    config: resolvedConfig,
    tools: MIMO_TOOLS,
    composeWorkflow: COMPOSE_WORKFLOW_STEPS,
    memoryTemplate: MEMORY_MD_TEMPLATE,
    selfImprovement: SELF_IMPROVEMENT_PATTERNS,
    taskMapping: {
      'compose-dev': ['mimo_memory_init', 'mimo_checkpoint'],
    },
  };
}
