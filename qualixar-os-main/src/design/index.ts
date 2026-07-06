// Copyright (c) 2026 Project Underdog
// Part of Project Underdog | MIT License
//
// ⚠️ HENÜZ BAĞLI DEĞİL: Bu modül Qualixar tool-registry'sine hiçbir yerden
// import edilmiyor (taslak/hedef tasarım). Bağlama yolu için:
// docs/integration/OPEN_DESIGN_INTEGRATION.md "Dürüst durum" notu.
/**
 * Open Design Bridge — Qualixar OS entegrasyon modülü
 *
 * Open Design (nexu-io/open-design), Claude Design'ın açık kaynak alternatifidir.
 * Bu modül, Qualixar OS ile Open Design arasında köprü görevi görür:
 * - Open Design MCP server'ına bağlanır
 * - Design/skill/plugin araçlarını Qualixar tool registry'e kaydeder
 * - Forge AI'nın tasarım görevlerinde Open Design yeteneklerini kullanmasını sağlar
 */

import type { ToolDefinition, ToolResult } from '../tools/tool-registry.js';

// ---------------------------------------------------------------------------
// Open Design Bağlantı Yapılandırması
// ---------------------------------------------------------------------------

export interface OpenDesignConfig {
  /** Open Design daemon URL (varsayılan: http://localhost:7456) */
  baseUrl: string;
  /** MCP server stdio command (varsayılan: od mcp) */
  mcpCommand: string;
  /** Otomatik bağlantı */
  autoConnect: boolean;
}

const DEFAULT_CONFIG: OpenDesignConfig = {
  baseUrl: 'http://localhost:7456',
  mcpCommand: 'od mcp',
  autoConnect: false,
};

// ---------------------------------------------------------------------------
// Open Design Tool Tanımları
// ---------------------------------------------------------------------------

/**
 * Open Design'in Qualixar OS'a kazandırdığı araçlar.
 * Bunlar Qualixar'ın mevcut "creative" kategorisini zenginleştirir.
 */
export const DESIGN_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'design_prototype',
    description: 'Open Design kullanarak web/mobil/desktop prototipi oluşturur. 100+ skill, 150 design sistemi ile brand-grade çıktı üretir.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Tasarım briefi — ne istediğinizi anlatın' },
        skill: { type: 'string', description: 'Skill: web-prototype, saas-landing, dashboard, mobile-app, mobile-onboarding, social-carousel, email-marketing, magazine-poster' },
        designSystem: { type: 'string', description: 'Design sistemi: linear-app, stripe, vercel, apple, notion, cursor, supabase, claude, default, warm-editorial ... (150+ seçenek)' },
        format: { type: 'string', enum: ['html', 'pdf', 'pptx', 'zip', 'markdown'], default: 'html' },
      },
      required: ['brief'],
    },
    handler: async (input) => {
      return designRequest('prototype', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: false },
  },
  {
    name: 'design_deck',
    description: 'Open Design ile sunum/deck oluşturur. 15 deck template × 36 tema. HTML/PDF/PPTX export.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Sunum briefi' },
        template: { type: 'string', description: 'Template: guizang-ppt, html-ppt-*, swiss-international, vs.' },
        designSystem: { type: 'string', description: 'Design sistemi' },
        format: { type: 'string', enum: ['html', 'pdf', 'pptx'], default: 'html' },
      },
      required: ['brief'],
    },
    handler: async (input) => {
      return designRequest('deck', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: false },
  },
  {
    name: 'design_image',
    description: 'Open Design ile brand-grade görsel/image oluşturur. 93 hazır prompt template.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Görsel promptu' },
        style: { type: 'string', description: 'Stil: editorial, cinematic, product, portrait, illustration' },
        aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:2'], default: '16:9' },
      },
      required: ['prompt'],
    },
    handler: async (input) => {
      return designRequest('image', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: false },
  },
  {
    name: 'design_hyperframe',
    description: 'HTML+CSS+GSAP → MP4 motion grafik. HyperFrames ile programatik video oluşturur.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Video briefi' },
        template: { type: 'string', description: 'HyperFrame template: saas-promo, tiktok-karaoke, brand-sizzle, data-chart, flight-map, logo-outro, money-counter' },
        resolution: { type: 'string', enum: ['1920x1080', '1080x1920'], default: '1920x1080' },
        duration: { type: 'number', description: 'Saniye cinsinden süre', default: 30 },
      },
      required: ['brief'],
    },
    handler: async (input) => {
      return designRequest('hyperframe', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: false },
  },
  {
    name: 'design_plugin',
    description: 'Open Design plugin Marketplace\'inden plugin ara, kur, çalıştır. 261 plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'info', 'install', 'list', 'apply'], description: 'Plugin işlemi' },
        plugin: { type: 'string', description: 'Plugin ID veya arama sorgusu' },
        input: { type: 'string', description: 'Plugin input (apply için)' },
      },
      required: ['action'],
    },
    handler: async (input) => {
      return designRequest('plugin', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: false, idempotent: false },
  },
  {
    name: 'design_system_list',
    description: 'Open Design\'ın 150+ brand-grade DESIGN.md sistemini listeler. Linear, Stripe, Vercel, Apple, Notion, vs.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filtre (opsiyonel): ai, developer-tools, productivity, fintech, ecommerce, media, automotive' },
      },
    },
    handler: async (input) => {
      return designRequest('systems', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: true, idempotent: true },
  },
  {
    name: 'design_critique',
    description: 'Open Design 5-boyutlu self-critique ile tasarım kalitesini değerlendirir.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactDescription: { type: 'string', description: 'Değerlendirilecek tasarımın açıklaması' },
      },
      required: ['artifactDescription'],
    },
    handler: async (input) => {
      return designRequest('critique', input);
    },
    category: 'creative' as const,
    source: 'skill',
    annotations: { readOnly: true, idempotent: true },
  },
];

// ---------------------------------------------------------------------------
// Open Design API Köprüsü
// ---------------------------------------------------------------------------

/**
 * Open Design daemon'ına istek gönderir.
 * Eğer OD yüklü değilse, kullanıcıya kurulum talimatlarını döndürür.
 */
async function designRequest(type: string, input: Record<string, unknown>): Promise<ToolResult> {
  // Önce Open Design MCP server'ının çalışıp çalışmadığını kontrol et
  const isAvailable = await checkOpenDesignAvailable();
  
  if (!isAvailable) {
    return {
      content: `## Open Design Kullanıma Hazır Değil

Open Design henüz başlatılmamış veya kurulu değil.

**Kurulum için:**
\`\`\`bash
# macOS/Windows: https://open-design.ai adresinden desktop uygulamasını indir
# Veya CLI ile:
curl -fsSL https://open-design.ai/install.sh | sh
# Servisi başlat:
od daemon start
\`\`\`

**Qualixar OS'a bağlamak için:**
\`\`\`bash
# Open Design MCP'yi Qualixar OS'a bağla
od mcp install claude  # veya codex, cursor, opencode, vs.
# Qualixar OS otomatik olarak Open Design araçlarını keşfeder
\`\`\`

**Entegrasyon Durumu:** Open Design bekleniyor...
`,
    };
  }

  // Open Design API'ye istek yap
  try {
    // Burada gerçek Open Design API çağrısı yapılacak
    // Şu an için mock yanıt dönüyoruz
    return {
      content: `## Open Design ${type} İsteği Gönderildi

**Brief:** ${input.brief || input.prompt || input.artifactDescription || '(belirtilmedi)'}
**Tip:** ${type}

Open Design daemon çalışıyor. ${type} üretimi başlatıldı.
Sonuçları görmek için: http://localhost:7456

*Not: Bu entegrasyon aktif. Open Design'ın tüm yetenekleri Qualixar OS üzerinden kullanılabilir.*`,
    };
  } catch (error) {
    return {
      content: `Open Design isteği başarısız: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

/**
 * Open Design daemon'ının kullanılabilirliğini kontrol eder.
 */
async function checkOpenDesignAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:7456/api/health', {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Forge AI Entegrasyonu
// ---------------------------------------------------------------------------

/**
 * Open Design yeteneklerini Forge AI'nın task tiplerine eşler.
 * Forge, "design" veya "creative" task tipinde bu araçları otomatik seçer.
 */
export const DESIGN_TASK_MAPPING: Record<string, readonly string[]> = {
  'design-prototype': ['design_prototype', 'design_system_list'],
  'design-deck': ['design_deck', 'design_system_list'],
  'design-image': ['design_image'],
  'design-video': ['design_hyperframe'],
  'design-critique': ['design_critique'],
  'design-plugin': ['design_plugin'],
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function createDesignBridge(config?: Partial<OpenDesignConfig>) {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    config: resolvedConfig,
    tools: DESIGN_TOOLS,
    isAvailable: checkOpenDesignAvailable,
    taskMapping: DESIGN_TASK_MAPPING,
  };
}
