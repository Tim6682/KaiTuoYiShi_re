import { chatCompletionNonStream } from './chatCompletionClient';
import { appendApiErrorReport } from './apiErrorReportService';
import { withRetries } from './retry';
import { isPioneerBaseUrl, normalizePioneerBaseUrl } from './pioneerProxyCore';
import { isArkBaseUrl, normalizeArkBaseUrl } from './arkProxyCore';
import { isClineBaseUrl } from './clineProxyCore';
import { CLINE_RECOMMENDED_MODELS } from './clineModels';
import { fetchOpenAICompatibleModels } from './openAICompatibleModels';
import {
  normalizeGeminiBaseUrl
} from './geminiEndpointPolicy';
import {
  createConnectionTestChallenge,
  matchesConnectionTestChallenge,
  normalizeConnectionTestResponse,
} from './connectionTestPolicy';

export interface ConnectionTestResult {
  ok: boolean;
  detail: string;
}

// 检测 OpenCode Zen 基础 URL
function isOpenCodeBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('opencode.ai') && 
         (lower.includes('/zen/') || lower.endsWith('/zen/v1') || lower.endsWith('/zen') ||
          (lower.includes('/v1') && lower.includes('zen')));
}

// 检测 Ollama 基础 URL
function isOllamaBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('ollama.com') || 
         lower.includes('localhost:11434') ||
         lower.includes('127.0.0.1:11434');
}

// 检测 NVIDIA NIM 基础 URL（官方网关为 integrate.api.nvidia.com；
// 保留 nim.api / ai.api 以兼容旧配置写法）
function isNvidiaNimBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('integrate.api.nvidia.com') ||
    lower.includes('nim.api.nvidia.com') ||
    lower.includes('ai.api.nvidia.com');
}

// 检测 Hugging Face 基础 URL
function isHuggingFaceBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('huggingface.co') || 
         lower.includes('api-inference.huggingface.co');
}

// 标准化 OpenCode Zen 基础 URL（/zen/v1 与 /zen/go/v1 均为官方网关，不互相折叠：
// 两者模型清单不同，折叠会让 Go 方案拿到 Zen 通用清单）
function normalizeOpenCodeModelsBaseUrl(baseRaw: string): string {
  let base = baseRaw.replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models(?:\/.*)?$/i, '');
  if (/^https:\/\/opencode\.ai$/i.test(base)) return `${base}/zen/v1`;
  if (/^https:\/\/opencode\.ai\/zen$/i.test(base)) return `${base}/v1`;
  if (/\/zen$/i.test(base)) return `${base}/v1`;
  return base;
}

function isOpenCodeGoBaseUrl(baseRaw: string): boolean {
  return /opencode\.ai\/zen\/go\/v1/i.test(baseRaw);
}

// 存根函数（待实现的服务）
function fetchMimoModels(_baseRaw: string, _apiKey: string): Promise<string[]> {
  return Promise.resolve([]);
}
function fetchGeminiModels(_baseRaw: string, _apiKey: string): Promise<string[]> {
  return Promise.resolve([]);
}
function fetchClaudeModels(_baseRaw: string, _apiKey: string): Promise<string[]> {
  return Promise.resolve([]);
}
function fetchBaiduQianfanModels(_baseRaw: string, _apiKey: string): Promise<string[]> {
  return Promise.resolve([]);
}
function fetchArkModels(_baseRaw: string, _apiKey: string): Promise<string[]> {
  return Promise.resolve([]);
}
function fetchPioneerModels(_baseRaw: string, _apiKey: string): Promise<string[]> {
  return Promise.resolve([]);
}

// 测试连接
export async function testConnection(config: any): Promise<ConnectionTestResult> {
  try {
    const models = await fetchModels(config);
    return { ok: true, detail: `成功获取到 ${models.length} 个模型` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// 主要的模型获取函数
export async function fetchModels(config: any): Promise<string[]> {
  const retryCount = Math.max(0, Math.trunc(Number(config?.retryCount ?? 0)) || 0);
  const baseRaw = (config?.baseUrl || '').trim();
  const apiKey = (config?.apiKey || '').trim();
  if (!baseRaw) throw new Error('缺少 Base URL');
  if (!apiKey) throw new Error('缺少 API Key');

  // 检测特定服务并使用对应的处理函数
  // 注意：我们需要避免与已经定义在底部的 fetchOpenCodeModels 函数命名冲突
  // 所以我们在这里使用不同的逻辑来调用它

  // 检测 OpenCode Zen 并使用现有的处理函数
  if (isOpenCodeBaseUrl(baseRaw)) {
    // 调用文件底部已经定义的 fetchOpenCodeModels 函数
    // 由于函数提升，这个引用是安全的，只要我们不在这里定义同名函数
    return fetchOpenCodeModels(baseRaw, apiKey);
  }

  // 检测 Ollama 并使用我们新定义的处理函数
  if (isOllamaBaseUrl(baseRaw)) {
    return fetchOllamaModels(baseRaw, apiKey);
  }

  if (config.provider === 'mimo' || /xiaomimimo|mimo\.mi/i.test(baseRaw)) {
    return fetchMimoModels(baseRaw, apiKey);
  }
  if (config.provider === 'gemini') {
    return fetchGeminiModels(baseRaw, apiKey);
  }
  if (isNvidiaNimBaseUrl(baseRaw)) {
    return fetchNvidiaNimModels(baseRaw, apiKey);
  }
  // 检测 Hugging Face 并使用对应的处理函数
  if (isHuggingFaceBaseUrl(baseRaw) || config.provider === 'huggingface') {
    return fetchHuggingFaceModels(baseRaw, apiKey);
  }
  if (config.provider === 'claude' || config.provider === 'claude_compatible') {
    return fetchClaudeModels(baseRaw, apiKey);
  }
  if (config.provider === 'baidu') {
    return fetchBaiduQianfanModels(baseRaw, apiKey);
  }
  if (config.provider === 'opencode') {
    return fetchOpenCodeModels(baseRaw, apiKey);
  }
  if (config.provider === 'cline' || isClineBaseUrl(baseRaw)) {
    return [...CLINE_RECOMMENDED_MODELS];
  }
  if (config.provider === 'ark' || isArkBaseUrl(baseRaw)) {
    return fetchArkModels(baseRaw, apiKey);
  }
  if (isPioneerBaseUrl(baseRaw)) {
    return fetchPioneerModels(baseRaw, apiKey);
  }
  return fetchOpenAICompatibleModels(baseRaw, apiKey);
}

// Ollama Cloud（ollama.com）实测对浏览器请求无 CORS 头；本地 Ollama 默认
// OLLAMA_ORIGINS 只放行同源。直连失败时用内置云端清单兜底，并对本地
// Ollama 给出 OLLAMA_ORIGINS 配置提示。
const OLLAMA_CLOUD_FALLBACK_MODELS: string[] = [
  'deepseek-v4-flash', 'deepseek-v4-pro',
  'minimax-m3', 'minimax-m2.7',
  'glm-5.1', 'glm-5.2', 'glm-5.3', 'glm-5.3-flash',
  'kimi-k2.6', 'kimi-k2.7-code', 'kimi-k3',
  'nemotron-3-ultra', 'nemotron-3-super', 'nemotron-3-nano',
  'mistral-large-3',
  'gpt-oss:120b', 'gpt-oss:20b',
  'gemma4', 'qwen3.5',
];

// 处理 Ollama 模型列表
async function fetchOllamaModels(baseRaw: string, apiKey: string): Promise<string[]> {
  // Ollama 使用 /api/tags 端点列出模型
  const base = baseRaw.replace(/\/+$/, '');
  // 移除可能的 /v1 后缀以得到基础 URL
  const baseWithoutV1 = base.replace(/\/v1$/, '');
  const candidates = Array.from(new Set([
    `${baseWithoutV1}/api/tags`,
    `${base}/api/tags`,
    `${baseWithoutV1}/api/models`, // 备用端点
    `${base}/api/models`,
  ]));

  const errors: string[] = [];
  const isLocalOllama = /localhost|127\.0\.0\.1/i.test(baseRaw);

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        // Ollama 通常不需要 Authorization 头，但如果提供了 apiKey 我们也可以尝试
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: 'Ollama 模型列表',
          config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
        continue;
      }

      const data = await res.json();
      let ids: string[] = [];

      // 处理 Ollama 的响应格式
      // 对于 /api/tags: { models: [{ name: 'model:version', ...}, ...] }
      // 对于 /api/models: 可能有不同格式
      if (data && Array.isArray(data.models)) {
        ids = data.models
          .map((m: { name?: string }) => m?.name)
          .filter((name: string | undefined): name is string => typeof name === 'string' && name.trim().length > 0)
          .map((name: string) => name.split(':')[0]); // 只取名称部分，去掉版本標籤
      } else if (data && Array.isArray(data)) {
        // 备用格式处理
        ids = data
          .map((m: { name?: string; id?: string }) => m?.name || m?.id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
      }

      if (ids.length) {
        // 去重
        return [...new Set(ids)];
      }

      errors.push(`${url} -> 返回格式异常（无法提取模型列表）`);
    } catch (error) {
      void appendApiErrorReport({
        source: 'Ollama 模型列表',
        config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 兜底：直连不可用（ollama.com 无 CORS / 本地 Ollama 未放行跨域）时，
  // 给出内置云端清单与可操作的修复提示，而不是直接抛错。
  if (isLocalOllama) {
    console.warn('[Ollama] 本地 Ollama 浏览器跨域被拒；请在启动 Ollama 时设置 OLLAMA_ORIGINS=* 后重启，再点获取列表。');
    return [...OLLAMA_CLOUD_FALLBACK_MODELS];
  }
  if (OLLAMA_CLOUD_FALLBACK_MODELS.length) {
    console.warn('[Ollama] 直连不可用（远端无 CORS），使用内置 Ollama Cloud 模型清单兜底。', errors.slice(0, 3));
    return [...OLLAMA_CLOUD_FALLBACK_MODELS];
  }

  throw new Error(`Ollama 获取模型列表失败：\n${errors.join('\n')}`);
}

// NVIDIA NIM（integrate.api.nvidia.com）实测对浏览器请求无 CORS 头：
// 聊天与模型列表在纯静态托管（GitHub Pages）下都无法直连。直连失败时
// 用内置精选清单兜底（取自实测 /v1/models 的 chat-capable 模型）。
const NVIDIA_NIM_FALLBACK_MODELS: string[] = [
  'deepseek-ai/deepseek-v4-flash-0731', 'deepseek-ai/deepseek-v4-pro-0813',
  'google/gemma-2b', 'google/gemma-3-4b-it', 'google/gemma-3-12b-it', 'google/gemma-4-31b-it',
  'ibm/granite-3.0-3b-a800m-instruct', 'ibm/granite-3.0-8b-instruct',
  'meta/llama-3.2-11b-vision-instruct', 'meta/llama-3.2-90b-vision-instruct', 'meta/muse-glimmer-30b',
  'microsoft/phi-3-vision-128k-instruct', 'microsoft/phi-3.5-moe-instruct',
  'minimaxai/minimax-m3',
  'mistralai/mistral-7b-instruct-v0.3', 'mistralai/mistral-large-2-instruct',
  'mistralai/mistral-nemotron', 'mistralai/mixtral-8x22b-v0.1',
  'nv-mistralai/mistral-nemo-12b-instruct',
  'moonshotai/kimi-k2.6', 'moonshotai/kimi-k3',
  'nvidia/llama-3.1-nemotron-51b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1', 'nvidia/llama3-chatqa-1.5-70b',
  'nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/nemotron-4-340b-instruct', 'nvidia/nemotron-nano-3-30b-a3b',
  'nvidia/mistral-nemo-minitron-8b-8k-instruct',
  'openai/gpt-oss-120b', 'openai/gpt-oss-20b',
  'writer/palmyra-creative-122b',
  'ai21labs/jamba-1.5-large-instruct', 'databricks/dbrx-instruct', '01-ai/yi-large',
  'aisingapore/sea-lion-7b-instruct',
];

// 处理 NVIDIA NIM 模型列表
async function fetchNvidiaNimModels(baseRaw: string, apiKey: string): Promise<string[]> {
  // NVIDIA NIM 使用 OpenAI 兼容的 /models 端点
  const base = baseRaw.replace(/\/+$/, '');
  // 移除可能的 /v1 后缀以获得一致的基础 URL
  const baseWithoutV1 = base.replace(/\/v1$/, '');
  const candidates = Array.from(new Set([
    `${base}/models`,
    `${baseWithoutV1}/v1/models`,
    `${baseWithoutV1}/models`,
  ]));

  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: 'NVIDIA NIM 模型列表',
          config: { provider: 'nvidia_nim', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
        continue;
      }

      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const ids = data.data
          .map((model: { id?: string }) => model?.id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
        if (ids.length) return ids;
      }
      errors.push(`${url} -> 返回格式异常（缺 data 数组）`);
    } catch (error) {
      void appendApiErrorReport({
        source: 'NVIDIA NIM 模型列表',
        config: { provider: 'nvidia_nim', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 兜底：浏览器直连被 CORS 拦（GitHub Pages 等静态托管必然发生）时，
  // 给出内置精选清单，保证用户仍可从官方已发布模型中选择。
  if (NVIDIA_NIM_FALLBACK_MODELS.length) {
    console.warn('[NVIDIA NIM] 浏览器直连被 CORS 拦截，使用内置精选模型清单兜底。', errors.slice(0, 3));
    return [...NVIDIA_NIM_FALLBACK_MODELS];
  }

  throw new Error(`NVIDIA NIM 获取模型列表失败：\n${errors.join('\n')}`);
}

// 处理 Hugging Face 模型列表
async function fetchHuggingFaceModels(baseRaw: string, apiKey: string): Promise<string[]> {
  // Hugging Face Inference API 没有标准的 /models 端点
  // 尝试从 Hugging Face Hub API 获取推荐模型
  const candidates = [
    'https://huggingface.co/api/models?filter=text-generation&sort=downloads&limit=50',
    'https://huggingface.co/api/models?filter=conversational&sort=downloads&limit=50',
  ];

  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: 'Hugging Face 模型列表',
          config: { provider: 'huggingface', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url} -> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
        continue;
      }

      const data = await res.json();
      let ids: string[] = [];

      if (Array.isArray(data)) {
        ids = data
          .map((model: { modelId?: string; id?: string }) => model?.modelId || model?.id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
      }

      if (ids.length) {
        return [...new Set(ids)];
      }

      errors.push(`${url} -> 返回格式异常（无法提取模型列表）`);
    } catch (error) {
      void appendApiErrorReport({
        source: 'Hugging Face 模型列表',
        config: { provider: 'huggingface', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 如果 API 调用失败，返回一些常用的默认模型
  const defaultModels = [
    'meta-llama/Llama-3.1-8B-Instruct',
    'meta-llama/Llama-3.1-70B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'google/gemma-2-9b-it',
    'google/gemma-2-27b-it',
    'Qwen/Qwen2.5-7B-Instruct',
    'Qwen/Qwen2.5-72B-Instruct',
    'microsoft/Phi-3.5-mini-instruct',
    'microsoft/Phi-3.5-medium-instruct',
  ];

  return defaultModels;
}

// 处理 OpenCode Zen 模型列表：三层策略。
// 1) 浏览器直连官方端点（当前响应无 CORS 头，仅在官方未来放开时生效）；
// 2) 同源代理兜底（本地 dev middleware / Cloudflare Pages Functions）；
// 3) 内置官方 Zen 模型清单兜底（GitHub Pages 等无后端部署的最终可用路径，
//    清单取自 opencode.ai/docs/zen 官方文档，随版本维护）。
const OPENCODE_ZEN_FALLBACK_MODELS: string[] = [
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
  'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.2', 'gpt-5.2-codex',
  'gpt-5.1', 'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini',
  'gpt-5', 'gpt-5-codex', 'gpt-5-nano',
  'claude-fable-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
  'claude-opus-4-6', 'claude-opus-4-5', 'claude-sonnet-5', 'claude-sonnet-4-6',
  'claude-sonnet-4-5', 'claude-haiku-4-5',
  'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
  'gemini-3.1-pro', 'gemini-3-flash',
  'grok-4.6', 'grok-4.5', 'grok-build-0.1', 'muse-spark-1.2',
  'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.5-plus',
  'deepseek-v4-pro', 'deepseek-v4-flash',
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'glm-5.2', 'glm-5.1', 'glm-5',
  'kimi-k2.5', 'kimi-k2.6', 'kimi-k2.7-code', 'kimi-k3',
  'big-pickle', 'mimo-v2.5-free', 'ling-3.0-flash-fin-free',
  'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free',
  'muse-spark-1.2-contributor-free',
];

// OpenCode Go 方案（/zen/go/v1）专属清单（取自实测 /zen/go/v1/models）。
const OPENCODE_ZEN_GO_FALLBACK_MODELS: string[] = [
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5',
  'longcat-2.0',
  'glm-5.2', 'glm-5.3-flash', 'glm-5.3', 'glm-5.1', 'glm-5',
  'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp',
  'qwen3.7-max', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.5-plus',
  'mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2.5-pro', 'mimo-v2.5',
  'hy4-preview', 'hy3', 'hy3-preview',
  'gpt-5.6-luna', 'grok-4.5', 'grok-4.6', 'muse-spark-1.2-contributor',
];

async function fetchOpenCodeModels(baseRaw: string, apiKey: string): Promise<string[]> {
  const base = normalizeOpenCodeModelsBaseUrl(baseRaw);
  // 移除可能的 /v1 后缀以获得一致的基础 URL
  const baseWithoutV1 = base.replace(/\/v1$/, '');
  const candidates = Array.from(new Set([
    `${base}/models`,
    `${baseWithoutV1}/v1/models`,
    `${baseWithoutV1}/models`,
    // 特殊处理 OpenCode Zen 的特殊路径
    `${baseRaw}/models`, // 保留原始路径作为备选
    `${baseRaw.replace(/\/v1$/, '')}/models`,
  ]));

  const errors: string[] = [];
  const extractIds = (data: unknown): string[] => {
    const list = (data as { data?: unknown } | null)?.data;
    if (!Array.isArray(list)) return [];
    const ids: string[] = [];
    for (const item of list) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id === 'string' && id.trim().length > 0) ids.push(id);
    }
    return ids;
  };

  for (const url of candidates) {
    let directFailed = false;
    // 1. 浏览器直连（官方端点支持跨域）
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const ids = extractIds(await res.json().catch(() => null));
        if (ids.length) return ids;
        errors.push(`${url}（直连）-> 返回格式异常（缺 data 数组）`);
      } else {
        directFailed = true;
        const text = await res.text().catch(() => '');
        errors.push(`${url}（直连）-> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
      }
    } catch (error) {
      directFailed = true;
      void appendApiErrorReport({
        source: 'OpenCode Zen 模型列表',
        config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url}（直连）-> ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!directFailed && !errors.length) continue;

    // 2. 代理兜底（仅本地 dev / CF Pages 有该路由）
    try {
      const res = await fetch('/api/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'models', baseUrl: url, apiKey }),
      });
      if (res.ok) {
        const ids = extractIds(await res.json().catch(() => null));
        if (ids.length) return ids;
        errors.push(`${url}（代理）-> 返回格式异常（缺 data 数组）`);
      } else {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: 'OpenCode Zen 模型列表',
          config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
          status: res.status,
          requestUrl: url,
          requestMode: 'models',
          responseText: text,
        });
        errors.push(`${url}（代理）-> ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
      }
    } catch (error) {
      void appendApiErrorReport({
        source: 'OpenCode Zen 模型列表',
        config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url}（代理）-> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 3. 内置官方清单兜底：直连与代理都不可用时（如 GitHub Pages 无后端），
  //    按 Go / Zen 方案分别给出对应的官方模型集合。
  if (isOpenCodeGoBaseUrl(baseRaw) && OPENCODE_ZEN_GO_FALLBACK_MODELS.length) {
    console.warn('[OpenCode Zen Go] 直连与代理均不可用，使用内置 Go 方案模型清单兜底。', errors.slice(0, 4));
    return [...OPENCODE_ZEN_GO_FALLBACK_MODELS];
  }
  if (OPENCODE_ZEN_FALLBACK_MODELS.length) {
    console.warn('[OpenCode Zen] 直连与代理均不可用，使用内置官方模型清单兜底。', errors.slice(0, 4));
    return [...OPENCODE_ZEN_FALLBACK_MODELS];
  }

  throw new Error(`OpenCode Zen 获取模型列表失败：\n${errors.join('\n')}`);
}