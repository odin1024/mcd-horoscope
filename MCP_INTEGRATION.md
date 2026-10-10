# MCP_INTEGRATION.md — 麦当劳 MCP 集成说明（麦门星盘）

本文档说明本项目**真实使用**的麦当劳 MCP Server、Tools、调用流程与业务价值，供参赛核验与开发者参考。

## 1. MCP Server 信息

| 项 | 值 |
|---|---|
| 服务提供方 | 金拱门（中国）有限公司（"麦当劳"） |
| 服务地址 | `https://mcp.mcd.cn` |
| 传输协议 | MCP Streamable HTTP（JSON-RPC 2.0） |
| 鉴权方式 | 请求头 `Authorization: Bearer <MCP_TOKEN>` |
| Token 获取 | [麦当劳 MCP 开放平台](https://open.mcd.cn/mcp) 登录 → 控制台 → 激活 |
| 官方限流 | 600 次/分钟（超限返回 429） |
| 配置示例 | 见 [`mcp-config.example.json`](./mcp-config.example.json)，仅含环境变量占位符 `${MCD_MCP_TOKEN}` |

## 2. 实际使用的 Tools

本项目使用 **2 个只读工具**，均为无需入参的查询能力，安全边界清晰：

### 2.1 `list-nutrition-foods` — 餐品营养信息列表

- **用途**：获取麦当劳常见餐品的营养成分（能量、蛋白质、脂肪、碳水化合物、钠、钙等）。
- **在本项目中的作用**：将用户测出的麦门星座人格与真实餐品匹配，在人格卡上展示本命餐品的真实营养数据（能量/蛋白质/脂肪/碳水）。
- **入参**：无。
- **响应格式**：官方为降低 Token 消耗，采用 **TOON（Token-Oriented Object Notation）** 紧凑格式返回，而非标准 JSON 数组。本项目在 `src/oracle.js` 中实现了 TOON 解析器（兼容字段顺序、数值归一化、含逗号餐品名）。

### 2.2 `campaign-calendar` — 活动日历查询工具

- **用途**：查询麦当劳中国当月的营销活动日历，返回进行中、往期和未来日期的活动。
- **在本项目中的作用**：每日生成"今日麦门指引"——优先选取"今日/进行中"的活动作为用户的"幸运活动"，配合确定性运势算法输出分享文案。活动内容每天更新，保证应用"每天都有新内容"。
- **入参**：`specifiedDate`（可选，`yyyy-MM-dd`，默认当月）。
- **响应格式**：官方以 **Markdown 文本** 返回（含活动标题、内容介绍、图片标签），本项目在 `src/oracle.js` 中实现了文本解析器（日期分段、标题/内容抽取、markdown 清洗）。

## 3. 调用流程

```text
浏览器页面（public/）
   │  POST /api/test { answers: [0..3] × 5 }
   ▼
server.js
   │  McpClient（src/mcp-client.js）
   │    1. initialize（MCP 握手：initialize → notifications/initialized）
   │    2. tools/call { name: 'list-nutrition-foods' }
   │    3. tools/call { name: 'campaign-calendar' }
   ▼
响应数据
   │  TOON 解析 → 营养数组
   │  Markdown 解析 → 活动数组
   ▼
业务组装
   persona（12 款人格，确定性算法）
   + matchNutrition（本命餐品匹配真实营养）
   + buildOracle（运势 + 幸运活动 + 指引）
   ▼
返回 JSON → 前端渲染人格卡
```

**客户端实现要点**（`src/mcp-client.js`）：

- 零第三方依赖：仅使用 Node.js 18+ 内置 `fetch`；
- 完整握手：`initialize` → `notifications/initialized` → `tools/call`；
- 自动限速：官方 600 次/分钟，客户端默认相邻调用间隔 ≥ 120ms，并在 429 时自动退避重试；
- 双形态响应兼容：JSON 信封（`{success, code, message, data}`）与纯文本（活动日历）统一解包；
- 缓存策略：营养数据缓存 1 小时、活动日历缓存 30 分钟，进一步降低调用频率；
- Mock 降级：未配置 Token 时自动进入演示模式，使用 `examples/mock-data.json`（结构与官方返回一致），clone 即可完整体验，不发起任何外网请求。

## 4. 业务价值

- **让"测人格"有真实依据**：同类测试通常是纯娱乐，麦门星盘把人格结果与麦当劳 MCP 的真实营养数据绑定，玩梗的同时有数据支撑；
- **让应用"每天都是新的"**：活动日历每日变化，驱动运势与幸运活动每日更新，形成用户回访习惯；
- **天然的传播载体**：人格卡可截图、分享文案可一键复制，围绕"麦门"社区文化形成自传播；
- **展示 MCP 生态价值**：证明一个品牌 MCP 不仅可用于点餐下单，也能支撑有创意、有温度的消费者互动应用。

## 5. 安全与合规

- 只调用**只读**工具，不涉及领券、下单、支付、积分等写操作；
- Token 仅通过环境变量 `MCD_MCP_TOKEN` 注入，仓库与配置示例不含任何真实密钥；
- 不收集、不存储用户手机号、地址等个人信息；昵称为前端本地输入，仅用于展示；
- 营养数据展示标注"仅供参考，不构成医疗或营养建议"，餐品与价格以麦当劳官方实时结果为准。
