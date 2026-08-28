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

// 检测 NVIDIA NIM 基础 URL
function isNvidiaNimBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('ai.api.nvidia.com') || 
         lower.includes('nim.api.nvidia.com');
}

// 检测 Hugging Face 基础 URL
function isHuggingFaceBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes('huggingface.co') || 
         lower.includes('api-inference.huggingface.co');
}

// 标准化 OpenCode Zen 基础 URL
function normalizeOpenCodeModelsBaseUrl(baseRaw: string): string {
  let base = baseRaw.replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/zen\/go\/v1/i, '/zen/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models(?:\/.*)?$/i, '');
  if (/^https:\/\/opencode\.ai$/i.test(base)) return `${base}/zen/v1`;
  if (/\/zen$/i.test(base)) return `${base}/v1`;
  return base;
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

  for (const url of candidates) {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
      const res = await fetch(url, { headers });

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
          .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
          .map((name: string) => name.split(':')[0]); // 只取名称部分，去掉版本标签
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

  throw new Error(`Ollama 获取模型列表失败：\n${errors.join('\n')}`);
}

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

// 处理 OpenCode Zen 模型列表（使用代理避免 CORS 问题）
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

  for (const url of candidates) {
    try {
      // OpenCode Zen 需要通过本地代理访问以避免 CORS 问题
      const res = await fetch('/api/opencode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'models',
          baseUrl: url,
          apiKey,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        void appendApiErrorReport({
          source: 'OpenCode Zen 模型列表',
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
      if (data && Array.isArray(data.data)) {
        const ids = data.data
          .map((model: { id?: string }) => model?.id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
        if (ids.length) return ids;
      }
      errors.push(`${url} -> 返回格式异常（缺 data 数组）`);
    } catch (error) {
      void appendApiErrorReport({
        source: 'OpenCode Zen 模型列表',
        config: { provider: 'openai_compatible', baseUrl: baseRaw, apiKey },
        requestUrl: url,
        requestMode: 'models',
        error,
      });
      errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`OpenCode Zen 获取模型列表失败：\n${errors.join('\n')}`);
}