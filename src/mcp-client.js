'use strict';

/**
 * mcp-client.js — 零依赖 MCP (Model Context Protocol) Streamable HTTP 客户端
 *
 * 对接：麦当劳中国 MCP Server（https://mcp.mcd.cn）
 * 协议：MCP Streamable HTTP + JSON-RPC 2.0
 * 鉴权：Authorization: Bearer <MCP_TOKEN>
 *
 * 设计要点：
 * 1. 零第三方依赖：仅使用 Node.js 18+ 内置的 fetch / Buffer / timers。
 * 2. 双模式：真实模式（连接官方 MCP）与 Mock 模式（使用 examples/mock-data.json 模拟数据），
 *    没有 Token 也能完整演示，符合"脱敏、可复现"的参赛要求。
 * 3. 官方限流为 600 次/分钟，客户端默认每次调用间隔 ≥ 120ms，并在 429 时自动退避重试。
 * 4. 响应解析兼容两种形态：
 *    - JSON 信封：{ success, code, message, datetime, data }
 *    - 纯文本：活动日历 / 优惠券列表 / 领券结果等工具直接返回 Markdown 文本
 *    解析结果统一为 { ok, data }，data 为对象或文本，上层逻辑无需感知来源差异。
 */

const DEFAULT_MCP_URL = 'https://mcp.mcd.cn';
const PROTOCOL_VERSION = '2024-11-05';

class MCPClientError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MCPClientError';
    this.code = code;
  }
}

class McpClient {
  /**
   * @param {Object} opts
   * @param {string} [opts.token]  MCP Token（真实模式必填；缺省时自动进入 Mock 模式）
   * @param {string} [opts.url]    服务地址，默认 https://mcp.mcd.cn，可用环境变量 MCD_MCP_URL 覆盖
   * @param {number} [opts.minIntervalMs] 相邻两次调用最小间隔，默认 120ms（官方限流 600 次/分钟）
   * @param {number} [opts.timeoutMs]     单次请求超时，默认 20s
   * @param {boolean} [opts.mock]         强制 Mock 模式（默认：无 Token 时自动开启）
   * @param {Object} [opts.mockData]      Mock 数据对象：{ [toolName]: "文本内容" 或 {success,data} }
   * @param {Object} [opts.logger]        日志对象，默认 console
   */
  constructor(opts = {}) {
    this.token = opts.token || process.env.MCD_MCP_TOKEN || '';
    this.url = opts.url || process.env.MCD_MCP_URL || DEFAULT_MCP_URL;
    this.minIntervalMs = opts.minIntervalMs ?? 120;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.logger = opts.logger || console;
    this.mockData = opts.mockData || {};
    this.mock = opts.mock !== undefined
      ? !!opts.mock
      : (this.token.trim() === ''); // 无 Token 自动 Mock

    this._initialized = false;
    this._lastCallAt = 0;
    this._requestId = 0;
  }

  get isMock() {
    return this.mock;
  }

  /**
   * 限速：确保两次调用之间至少间隔 minIntervalMs。
   */
  async _throttle() {
    const now = Date.now();
    const wait = Math.max(0, this._lastCallAt + this.minIntervalMs - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._lastCallAt = Date.now();
  }

  /**
   * 发送一条 JSON-RPC 消息（支持自动重试 429）。
   */
  async _post(payload, retryLeft = 2, opts = {}) {
    if (this.mock) {
      return this._mockDispatch(payload);
    }

    await this._throttle();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new MCPClientError(`网络请求失败: ${err.message}`, 'NETWORK');
    }
    clearTimeout(timer);

    if (res.status === 401) {
      throw new MCPClientError(
        'MCP Token 无效、已过期或未提供（HTTP 401）。请检查 MCD_MCP_TOKEN 配置。',
        'AUTH'
      );
    }

    if (res.status === 429) {
      if (retryLeft > 0) {
        const delay = 800 * (3 - retryLeft); // 800ms / 1600ms 退避
        this.logger.warn(`[mcp] 触发限流 429，${delay}ms 后重试`);
        await new Promise((r) => setTimeout(r, delay));
        return this._post(payload, retryLeft - 1, opts);
      }
      throw new MCPClientError(
        '触发麦当劳 MCP 限流（HTTP 429，600 次/分钟）。请降低请求频率。',
        'RATE_LIMIT'
      );
    }

    if (!res.ok) {
      throw new MCPClientError(`MCP 服务返回异常状态码: HTTP ${res.status}`, 'HTTP');
    }

    const text = await res.text();

    // JSON-RPC 通知（如 notifications/initialized）可能无响应体
    if (text.trim() === '') {
      if (opts.allowEmpty) return null;
      throw new MCPClientError('MCP 返回了空响应体', 'PARSE');
    }

    // Streamable HTTP 可能返回 SSE 流；多数实现直接返回 JSON。两者都兼容处理。
    if (text.trimStart().startsWith('event:')) {
      return this._parseSse(text);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new MCPClientError('MCP 返回了无法解析的响应体', 'PARSE');
    }
  }

  /**
   * 解析 SSE 文本，取最后一个 data: 行（JSON）。
   */
  _parseSse(text) {
    let jsonLine = null;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) jsonLine = data;
      }
    }
    if (jsonLine) {
      try {
        return JSON.parse(jsonLine);
      } catch {
        throw new MCPClientError('MCP SSE 响应中的 data 无法解析为 JSON', 'PARSE');
      }
    }
    throw new MCPClientError('MCP 返回的 SSE 响应缺少 data 内容', 'PARSE');
  }

  /**
   * Mock 分发：按工具名返回预设模拟数据。
   * 支持两种预设形态：
   *  - 字符串：直接作为纯文本 data 返回；
   *  - 对象：{ success, data } 按 JSON 信封返回。
   */
  _mockDispatch(payload) {
    const method = payload.method;
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: payload.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'mcd-mcp (mock)', version: '1.0.0' },
        },
      };
    }
    if (method === 'notifications/initialized') {
      return null;
    }
    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: payload.id,
        result: { tools: [{ name: 'mock-tool', description: 'Mock 模式下工具列表' }] },
      };
    }
    if (method === 'tools/call') {
      const toolName = payload.params && payload.params.name;
      const preset = this.mockData[toolName];
      let text;
      if (preset === undefined) {
        text = JSON.stringify({ success: true, code: 200, message: 'Mock 无数据', data: null });
      } else if (typeof preset === 'string') {
        text = preset;
      } else {
        text = JSON.stringify(preset);
      }
      return {
        jsonrpc: '2.0',
        id: payload.id,
        result: {
          content: [{ type: 'text', text }],
          isError: false,
        },
      };
    }
    return { jsonrpc: '2.0', id: payload.id, result: {} };
  }

  /**
   * MCP 握手：initialize + notifications/initialized。
   */
  async initialize() {
    if (this._initialized) return;
    if (this.mock) {
      this._initialized = true;
      return;
    }
    const init = await this._post({
      jsonrpc: '2.0',
      id: ++this._requestId,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'mcd-horoscope', version: '1.0.0' },
      },
    });
    const result = init && init.result;
    if (!result || !result.serverInfo) {
      throw new MCPClientError('MCP initialize 未返回有效的 serverInfo', 'HANDSHAKE');
    }
    // 通知 initialized（通知无 id、无响应）
    await this._post(
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
      2,
      { allowEmpty: true }
    );
    this._initialized = true;
  }

  /**
   * 调用 MCP 工具，返回统一结构 { ok, data, raw }。
   * data 已去除 MCP 信封，直接是官方 data 字段（对象）或纯文本（字符串）。
   */
  async callTool(name, args = {}) {
    if (!this.mock && !this._initialized) {
      await this.initialize();
    }
    const raw = await this._post({
      jsonrpc: '2.0',
      id: ++this._requestId,
      method: 'tools/call',
      params: { name, arguments: args },
    });

    if (this.mock) {
      // mock 的 _post 已返回完整 MCP result 信封
      const content = raw && raw.result && raw.result.content;
      const text = Array.isArray(content)
        ? content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n')
        : '';
      return this._unwrap(text, raw);
    }

    if (raw && raw.error) {
      throw new MCPClientError(`MCP 调用失败: ${raw.error.message || JSON.stringify(raw.error)}`, 'TOOL');
    }
    const content = raw && raw.result && raw.result.content;
    const text = Array.isArray(content)
      ? content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n')
      : '';
    return this._unwrap(text, raw);
  }

  /**
   * 将 MCP tools/call 的 text 拆成 { ok, data, raw }：
   *  - 若能 JSON.parse 且包含 success 字段 → data = parsed.data（JSON 信封）
   *  - 若能 JSON.parse 但无 success 字段 → data = parsed
   *  - 否则 → data = text（纯文本工具）
   */
  _unwrap(text, raw) {
    let data = text;
    let ok = true;
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    // 官方部分工具（营养/积分/时间等）返回"字段说明包装"文本：
    //   # API Response Information ... ## Original Response \n {json}
    // 整体 JSON.parse 会失败，需从 ## Original Response 标记后截取 JSON 再解析。
    if (parsed === null) {
      const marker = text.indexOf('## Original Response');
      if (marker >= 0) {
        let candidate = text.slice(marker + '## Original Response'.length).trim();
        candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        try {
          parsed = JSON.parse(candidate);
        } catch {
          parsed = null;
        }
      }
    }
    if (parsed !== null && typeof parsed === 'object') {
      if ('success' in parsed) {
        ok = parsed.success === true;
        data = parsed.data !== undefined ? parsed.data : parsed;
      } else {
        data = parsed;
      }
    }
    return { ok, data, raw };
  }
}

module.exports = { McpClient, MCPClientError, DEFAULT_MCP_URL };
