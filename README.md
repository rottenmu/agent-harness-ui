# agent-harness-ui

Agent Harness 的独立前端应用（Vue 3 + NaiveUI + Monaco + D3 + Vite），内含**两个表面**：

| 表面 | 说明 |
| --- | --- |
| **运行时控制台**（默认） | Codex 风格的会话运行时视图：左栏会话导航 / 中栏时间线 + Composer / 右栏产出与上下文统计 / 最右 Diff 侧栏 / 底部日志坞 |
| **智能体评测工作台** | 既有的评测表面：用例树、对话轨迹、执行流图、断言编辑、批量评测指标 |

两个表面共享同一份运行时会话上下文（`usePiSession()` 单例），通过左栏顶部导航切换。
设计系统源自参考项目 [pi-gui](https://github.com/minghinmatthewlam/pi-gui) 的移植 —— 详见
`docs/plans/2026-09-10-pi-gui-frontend-port.md`（含逐条真机验证结果与偏差记录）。

**已与后端 `modules/agent-harness`（:9900）完成联调**：用例、执行链路、Agent 与模型选项、单步调用、
批量评测全部走真实接口；后端不可用时自动降级为内置 mock，降级状态在顶栏常驻可见。

## 功能

### 运行时控制台

- **会话侧栏**：主按钮 + 分节（THREADS 可折叠）+ 按 workspace 分组 + 两行式会话行（标题/预览），悬停出置顶与归档；搜索框实时过滤
- **时间线 5 类型**：`user` / `assistant` / `activity`（轻量活动行）/ `tool` / `summary`（带眉标结论卡）
- **Composer 主控点**：22px 大圆角输入盒 + 常驻快捷键提示 + 模型/思考级别 + 投递语义切换（`排队` / `插话`）+ 圆形发送键；输入 `/` 打开命令面板（`/model` `/thinking` `/tools` `/clear`）
- **状态机只有 3 态**：`idle` / `running` / `failed`；排队不占状态位，由 `runningRunId` + `queuedMessages` 表达
- **工具行**：折叠 JSON 入参/返回、`+N/-N` 差异统计、状态点、`view in diff` 直达差异侧栏
- **Diff 侧栏**：`Ctrl+D` 开合（可点标题栏 `×` 关）；按文件分组渲染 hunk，增删行着色；**前端不做差异计算**
- **虚拟滚动**：长链路会话（247 项）下 DOM 时间线节点 ≤ 40，滚动跟随由手势门控
- **主题**：浅 / 深双主题，侧栏页脚一键切换，`<html>` 增删 `dark` 类即整体翻转

### 评测工作台

- **顶部导航**：数据源与连接状态指示（含失败原因）、重新连接、Run Selected（批量评测）/ Stop / Export Report
- **评测用例树**：Suite → Case 层级，勾选多选 + 搜索过滤，节点后缀显示状态色点（pass / fail / running）
- **对话 Trace**：按 User / Agent / ToolCall / Error 分类着色的消息卡片，展示 token 数与耗时；工具调用可折叠查看 JSON 入参和返回；底部支持手动输入 Prompt 并 Step Run
- **执行流图**：D3 力导向图渲染 Agent 执行链路（Start 灰 / LLM 蓝 / Tool 绿 / End·Error 红），支持节点拖拽、滚轮缩放、空白处平移
- **Agent 配置**：执行目标 Agent、Agent 类型、模型下拉，**输出语言**选择，Monaco 编辑 System Prompt，Temperature / 最大迭代次数
- **用例与断言**：Monaco 编辑 Case 输入 Prompt 与预期断言 JSON，按用例隔离草稿，断言非法时拒绝落盘
- **实时日志**：info 灰 / warn 黄 / error 红，自动滚底，上限 300 条
- **指标面板**：Passed / Failed / Total 与通过率进度条，支持按类别查看通过率

## 技术栈

| 依赖 | 版本 | 用途 |
|---|---|---|
| vue | ^3.4 | 组件框架（`<script setup>`） |
| naive-ui | ^2.38 | 布局、树、Tabs、表单、Collapse、Tag |
| d3 | ^7.9 | 力导向执行流图（drag / zoom） |
| monaco-editor | ^0.45 | System Prompt / Case Prompt / 断言 JSON 编辑器 |
| vite | ^5.4 | 构建与 dev server |

> 图标不依赖 `@vicons/material`（该包约 80MB、数千文件，安装与构建都很慢），
> 4 个图标以内联 SVG 形式放在 `src/components/AppIcon.vue`。

## 快速开始

```bash
npm install
npm run dev      # 开发 → http://127.0.0.1:16600（localhost:16600 同样可访问）
npm run build    # 生产构建 → dist/
npm run preview  # 预览构建产物
```

> **端口固定为 `16600`**（遵循 `frontend/AGENTS.md`，`strictPort: true`，不要改动）。
> 若端口被占用，请先停止占用该端口的进程，而不是换端口。
>
> **`host` 固定为 `127.0.0.1`，请勿改回默认值。** Vite 默认的 `localhost` 在 Windows 上只解析到 `::1`，
> 会绑成 IPv6-only，表现为 `http://localhost:16600` 能开、`http://127.0.0.1:16600` 连接失败
> （而不少预览工具与脚本默认用 `127.0.0.1`）。固定为 `127.0.0.1` 后两个地址都可用，
> 且仍只监听环回地址、不会暴露到局域网。

dev 阶段 Vite 将 `/api` 代理到 `http://localhost:9900`，接入真实后端时无需改前端代码。

## 目录结构

```
agent-harness-ui/
├── vite.config.js            # dev server :16600（host=127.0.0.1）+ /api → :9900 代理 + monaco 分包
├── index.html
└── src/
    ├── main.js               # 应用入口（样式分层导入 → initTheme → mount）
    ├── App.vue               # 仅提供主题与消息 Provider（消费方是 AppShell）
    ├── theme.js              # 主题模式 + NaiveUI 覆写；色板「读出」自 CSS 变量，不另存一份
    ├── monaco-setup.js       # Monaco Web Worker 装配（Vite ?worker 方式）
    ├── api/                  # 后端访问层（对齐 modules/agent-harness）
    │   ├── client.js             # fetch 封装：token 注入 / ApiResponse 解包 / 超时 / 401 处理
    │   ├── auth.js               # 登录（admin/admin）与 token 存取
    │   ├── observ.js             # 观测中心接口：用例 / 轨迹 / 批次 / 大盘 / chat / agents
    │   ├── adapters.js           # 后端 DTO → 前端视图模型的映射
    │   ├── sessionDriver.js      # 会话**契约层**：3 态枚举 / 8 事件 / 6 方法（无实现）
    │   └── harness.js            # SSE 实时推送接入位（后端暂未提供，当前预留）
    ├── composables/          # 组合式函数（核心逻辑）
    │   ├── useWorkbench.js       # 门面：面板 / 用例树 / 日志指标 / Agent 配置
    │   ├── useBackend.js         # 数据源开关与连接状态（remote ↔ mock 自动降级）
    │   ├── useCaseCatalog.js     # 用例目录：远端拉取 / 状态回填 / Agent 与模型选项
    │   ├── useCaseRunner.js      # 执行引擎：单步 Step Run + 批量 Run Selected
    │   ├── useRunSession.js      # 运行期会话状态与可中断定时器
    │   ├── useExecutionGraph.js  # D3 力导向图：渲染 / 拖拽 / 缩放 / 重布局
    │   ├── useMonacoEditor.js    # Monaco 生命周期：创建 / layout / 内容同步 / 释放
    │   ├── sessionVisibility.js  # 会话「可见/状态」类事实的唯一推导源（纯函数，无状态）
    │   ├── usePiSession.js       # 会话状态机（单例）：时间线 / 队列 / 投递语义 / 定时器
    │   └── useCaseDrafts.js      # 按用例隔离的 Prompt 与断言草稿
    ├── components/           # 展示型子组件（只渲染 + 上抛事件）
    │   ├── AppIcon.vue           # 内联 SVG 图标集（描边风格，替代 @vicons/material）
    │   ├── AppShell.vue          # 应用外壳：侧栏 + 表面切换（console / workbench）
    │   ├── SessionSidebar.vue    # 会话侧栏：应用导航 + 分节 + 分组 + 两行式会话行
    │   ├── RuntimeConsole.vue    # 运行时控制台表面（面包屑 / 时间线 / Composer / 右栏 / 日志坞）
    │   ├── ConversationTimeline.vue  # 时间线虚拟滚动容器 + 手势门控跟随底部
    │   ├── TimelineItem.vue      # 时间线项 5 变体（user/assistant/activity/tool/summary）
    │   ├── TimelineToolRow.vue   # 工具行：折叠 JSON + `+N/-N` + `view in diff`
    │   ├── DiffPanel.vue         # 差异侧栏（Ctrl+D 开合、工具行直达）
    │   ├── Composer.vue          # Composer 主控点（输入盒 / 命令面板 / 投递语义）
    │   ├── SlashMenu.vue         # `/` 命令面板
    │   ├── HarnessWorkbench.vue  # 评测工作台表面（消费 n-message-provider）
    │   ├── TopBar.vue
    │   ├── CaseTree.vue
    │   ├── ConversationTrace.vue
    │   ├── MessageCard.vue
    │   ├── ExecutionGraph.vue
    │   ├── AgentConfigForm.vue
    │   ├── CaseAssertEditor.vue
    │   ├── LogPanel.vue
    │   └── MetricsPanel.vue
    ├── mock/                 # 内置 mock 数据（后端不可用时的降级数据源）
    │   ├── cases.js              # 用例树 + 扁平索引
    │   ├── sessions.js           # 会话种子 + 时间线 5 类 + 差异 + 产出物 + 命令表
    │   ├── traces.js             # 对话轨迹 + 执行流图
    │   ├── simulate.js           # 运行期新增消息的数据工厂（纯数据，无调度）
    │   └── config.js             # 默认 Agent 配置与编辑器模板
    ├── styles/
    │   ├── theme-values.css      # 全工程**唯一**色值源：:root（浅）/ :root.dark（深）
    │   ├── tokens.css            # 尺度体系（间距/圆角/字号/动效）+ 由色值派生的语义层
    │   └── global.css            # html/body 基础样式
    └── utils/
        ├── format.js         # 时间 / JSON / 状态文案格式化
        └── prompt.js         # 出站消息的「输出语言」指令注入
```

### 改色只改一处

色值只允许出现在 `src/styles/theme-values.css`。其余一切颜色都从它派生：

- **CSS 侧**：`tokens.css` 用 `color-mix(in srgb, var(--ink-strong) N%, transparent)` 混出边框、叠加层、
  强调 tint、状态 tint。`--ink-strong` 在深色取白、浅色取黑，因此这些派生值**自动随主题翻转**，
  不需要逐个选择器覆写。
- **JS 侧**：`theme.js` 在挂载后读 CSS 变量的 computed 值填入 `PALETTE`，NaiveUI 的 `themeOverrides`
  与 D3 的节点/连线色都从这同一份取值来。`PALETTE` 的初值是**空串**而不是某个"备选色值"——
  备选色就是第二份色板，会在某个分支上悄悄退回旧色。

提交前可自查：`grep -rn "#[0-9a-fA-F]\{6\}\b\|rgba(\|hsl(" src --include=*.vue --include=*.css | grep -v theme-values.css` → 应为空。


## 架构说明

### 状态集中在 composable

`App.vue` 只提供主题与消息 Provider，`HarnessWorkbench.vue` 做布局编排和事件转发，
业务状态与动作全部落在 composable：

| composable | 职责 |
|---|---|
| `useWorkbench` | 门面 Hook：面板 Tab、用例选择、Trace 加载、日志与指标、Agent 配置；内部组合 `useCaseRunner` 后统一返回 |
| `useBackend` | 数据源开关：登录 → 探测 → 失败自动降级 mock，并把 mode/status/error 暴露给顶栏 |
| `useCaseCatalog` | 用例目录取数与状态回填，同时提供 Agent / 模型 / 类型下拉选项 |
| `useCaseRunner` | 执行引擎：单步与批量执行的调度、指标重算、报告组装；依赖由调用方注入，不持有全局状态 |
| `useRunSession` | 运行期状态：消息列表、运行标志、步骤计数、执行流图，以及可被一次性中断的定时器 |
| `useExecutionGraph` | D3 图的渲染与交互，内置「隐藏 Tab 尺寸为 0」「重绘前清理」等处理 |
| `useMonacoEditor` | 编辑器创建/销毁配对、隐藏转可见后 `layout()`、写入时保留撤销栈 |
| `useCaseDrafts` | 按 `caseId` 隔离的草稿存储，断言 JSON 校验失败不落盘 |
| `sessionVisibility` | 会话状态类的**唯一推导源**：`isRunning` / `deriveStatus` / `hasUnseenUpdate` / 排序与分组。纯函数、无状态、无 ref |
| `usePiSession` | 运行时控制台的会话状态机（**单例**）：会话列表、时间线、排队与投递语义、运行定时器 |

> 拆分依据 `docs/rules/CODE_SIZE_RULES.md`：Hooks 公共逻辑单文件有效代码 ≤ 150 行。
> 当前最大的两个是 `useCaseRunner`（142）与 `useExecutionGraph`（140），均达标。

### 运行时控制台的会话契约

界面对 runtime 的认知被收窄到 `src/api/sessionDriver.js` 一份**契约**里（3 个状态 + 8 个事件 + 6 个方法），
`usePiSession` 只是它的一个实现。接真实后端时只换实现层，UI 不动。

三条不可简化的设计：

1. **状态只有三态** `idle | running | failed`。排队**不占状态位**，由 `runningRunId` + `queuedMessages`
   表达。因此「现在有没有在跑」在全工程只有一处判断：`runningRunId !== null`（`isRunning()`）。
   反例是把 `pending` 同时表示"还没开始"和"排队中"——两个状态值表达同一件事，就是同一事实两处推导。
2. **消息投递有且只有两种语义**：`steer`（插话，注入当前这一轮）/ `followUp`（排队，本轮结束后作为新一轮）。
   把两者挤成一个"发送"，运行中发消息的语义就是未定义的。
3. **派生字段不落库**。`status` / `unseen` / `lastError` 都不出现在会话记录里，一律在渲染时由
   `sessionVisibility` 推导。打开 `mock/sessions.js` 会看到种子数据里**没有** `status` 字段，只有
   `runningRunId` —— 这不是遗漏，是刻意让"两处副本"在结构上无法存在。

### 四个必须知道的实现约束

1. **隐藏容器不能渲染**：中间 Tab 切到 graph 前，SVG 的 `clientWidth` 为 0。`ExecutionGraph` 因此在 `activeTab === 'graph'` 时才渲染，并监听 Tab 切换重绘。
2. **Monaco 需要明确高度**：`.monaco-host-*` 都设了固定高度，高度塌陷会让编辑器不可见。Tab 隐藏转可见后 `automaticLayout`（依赖 ResizeObserver）有延迟，需手动 `layout()`。
3. **写入编辑器用 `pushEditOperations`**：`editor.setValue()` 会清空撤销栈，切换用例后用户无法 undo。
4. **Monaco 所在的 Tab 必须声明 `display-directive="show"`**：`n-tab-pane` 该属性默认值为 `if`，非激活面板会被**卸载**，Monaco 挂载的 DOM 节点随之销毁，切回后只剩空容器、编辑器永久不可见。改为 `show` 后面板常驻 DOM（`v-show` 隐藏），切回时手动 `layout()` 修正尺寸即可。
   > 注意：该属性读的是**每个 `n-tab-pane` 自身的 props**（`n-tabs` 没有这个 prop），因此必须写在 `n-tab-pane` 上而非 `n-tabs` 上。

## 后端联调

**已与 `modules/agent-harness`（即 `agent-application`，:9900）完成联调。** 前端不再只跑 mock：
启动时登录后端并拉取真实数据，后端不可用时才降级为内置 mock，降级状态在顶栏常驻可见。

### 数据流

```
浏览器 :16600
  └─ /api/**  ──Vite 代理──▶  agent-application :9900
                               ├─ /api/auth/login                       登录取 token
                               └─ /api/biz/ai/**                        观测中心 + 对话
```

### 接口对应关系

| 前端动作 | 后端接口 | 说明 |
|---|---|---|
| 启动 / 重连 | `POST /api/auth/login` | `admin` / `admin`，`department` 需为「行政」；token 存 `sessionStorage` |
| 连接探测 | `GET /api/biz/ai/observ/dashboard?days=1` | 轻量且鉴权链路完整，用于判定连通性 |
| 用例树 | `GET /api/biz/ai/observ/test-cases` | 按 `category` 聚合成「套件 → 用例」两级树 |
| 用例状态 | `GET /api/biz/ai/observ/test-runs?limit=1`<br>`GET /api/biz/ai/observ/test-runs/{id}/report` | 取最近一次批次并回填各用例的 PASS/FAIL |
| 执行链路 | `GET /api/biz/ai/observ/traces?agentId=…&limit=1`<br>`GET /api/biz/ai/observ/traces/{id}` | 取该用例所绑 Agent 的最近一条 trace + steps，映射为消息卡片与执行流图 |
| Agent 选项 | `GET /api/biz/ai/agents` | 同时回填该 Agent 真实的 `agentType` 与 `model` |
| 模型选项 | `GET /api/biz/ai/model-configs` | |
| **Step Run** | `POST /api/biz/ai/chat` | `{agentId, message, sessionId}`；同步返回完整回复 |
| **Run Selected** | `POST /api/biz/ai/observ/test-runs`<br>`GET /api/biz/ai/observ/test-runs/{id}/report` | 后端**同步**执行整批，再用报告回填指标与逐条结果 |

鉴权头为 `Authorization: <token>`（非 `Bearer` 前缀），由 `api/client.js` 统一注入；
收到 401 会清除本地 token，用户可点顶栏「重新连接」重走登录，无需刷新页面。

### 三处联调期实测得出的约束

1. **`/chat` 没有 `systemPrompt` 入参** —— 模型输出语言完全由 `ai_managed_agent.persona` 决定。
   库里多个智能体的 `persona` 为空，实测会返回英文。因此前端在**出站消息**前注入一段语言指令
   （见 `utils/prompt.js`），默认「简体中文」，也可切「跟随智能体 persona」关闭注入。
   > 注入只作用于请求体，消息卡片展示的仍是用户原文，不污染评测记录。
2. **用例的 `agentId` 可能为空** —— 5 个内置用例中仅 2 个绑定了 Agent。此时加载用例会退回
   「用例输入 + 提示」的占位轨迹，Step Run 的落点回落到配置面板选定的执行目标；
   两者都没有时给出明确错误卡片而非静默失败。
3. **批次为同步执行** —— 后端一次 HTTP 请求跑完整批，期间无法中断。
   前端「停止」只影响本地等待状态，界面上有对应提示。

### 尚未接通的接口

`src/api/harness.js` 预留了 SSE 实时推送接入位（`attachSse`），后端目前未提供该端点，
当前 Step Run 与批量执行均走同步 HTTP。后端补齐后可平滑替换 `useCaseRunner` 中的调用。

## 本地运行前置

```bash
# 1. 启动后端（需先构建：mvn -pl agent-application -am package）
cd <repo root>
java --add-opens=java.base/java.nio=ALL-UNNAMED \
  -jar agent-application/target/agent-application-1.0.0.jar \
  --server.port=9900 --ai.agent.plugin-dir=data/plugins-disabled

# 2. 启动本前端
cd frontend/agent-harness-ui && npm run dev
```

> `--add-opens` 是 Arrow 内存模块的硬性要求，缺失会导致启动失败。
> `--ai.agent.plugin-dir` 指向一个空目录可跳过动态插件扫描；若 `data/plugins/` 下存在
> 旧包名（`com.zimo.starter.*`）编译的插件 jar，加载会抛异常并导致整个上下文启动失败。
> 后端未启动时前端仍可运行 —— 会自动降级为 mock 并在顶栏标注「本地模拟数据」。

## 单文件交付物

除上面的完整工程外，本目录还提供两份**单文件 SFC**：整页 UI + 逻辑全部收在一个 `App.vue` 里，
不带 `api/` `composables/` `components/` 等目录。适合直接把文件丢进别的工程、或做独立演示。
两份都是 **mock 数据驱动、零后端依赖**；接真实 SSE 的位置已在脚本区用注释标出。

| 文件 | 定位 | 预览地址 |
|---|---|---|
| `single-file/App.vue` | **智能体评测工作台** —— 用例树 + 断言编辑 + 批量评测指标 + 执行流图 + 高危工具审批 | `http://127.0.0.1:16600/single-file-test.html` |
| `single-file-debug/App.vue` | **智能体运行调试平台** —— Codex 风格高密度暗色，会话树 + 对话轨迹/执行图 + Agent 配置/产出物 + 实时日志/上下文统计 | `http://127.0.0.1:16600/single-file-debug-test.html` |

根目录的 `single-file-test.html` / `single-file-debug-test.html` 与各自的 `main.js`
只是本地预览入口，**不是交付物**；迁移时只带 `App.vue` 即可。

### 单文件场景下必须遵守的 6 条约束

都是本仓库真实踩过的坑，改代码时不要"顺手优化"掉：

1. **不要用 `useMessage()` / `useDialog()`**。naive-ui 的这类能力依赖父级 Provider；
   Provider 与调用方写在同一个组件里时，调用发生在 Provider 建立之前 → 返回 `undefined`
   → 整页白屏且**控制台没有任何报错**。单文件无法拆成两个组件，故两份交付物都自研了轻量 toast。
2. **`n-tab-pane` 要显式写 `display-directive="show"`**。默认是 `"if"`，切走会把面板从 DOM 卸载；
   Monaco 实例挂在这些容器上，容器一销毁编辑器 DOM 就没了，切回来一片空白且同样无报错。
3. **`n-modal` 要指定 `to="#harness-root"`**。默认 teleport 到 `body`，弹窗会脱离根节点作用域，
   CSS 变量（`--bg-sunken` 等）不继承、scoped 样式全部失效。挂到根节点内部即可同时拿到两者。
4. **撑满内容区要写 `.n-tab-pane`，不是 `.n-tabs-pane-wrapper`**。`type="line"` 且 `animated=false` 时
   naive 不渲染 pane-wrapper，各面板是 `.n-tabs` 的直接 flex 子元素；写 pane-wrapper 是空选择器，
   表现为「卡片在 DOM 里但高度为 0，完全看不见」。
5. **调试平台的轨迹虚拟列表：`item-size` 必须 <= 单条消息最小高度**（与 CSS `.msg` 的
   `min-height` 相等，且要显式写 `box-sizing: border-box`）。`n-virtual-list` 的 `item-size`
   只接受纯数字，渲染窗口按 `endIndex = startIndex + ceil(listHeight/itemSize + 1)` 估算；
   取值一旦大于最小行高，可视区尾部就会留白。反向也不能一味调小 —— 实测行高修正会带来
   `(实际高度 - itemSize)` 的正向漂移，取值越小于真实高度，滚到底后的空隙越大。
   **取不变式允许的最大值最优**（当前 = 48px）。
6. **判定"用户是否在跟随底部"必须过滤掉布局驱动的 `scroll` 事件**，只认用户手势
   （`wheel` / `touchmove` / 拖 `.n-scrollbar-rail`）。虚拟列表实测行高时会自行调整内容高度与
   `scrollTop`；若把这类 `scroll` 也算成"用户向上滚了"，跟随模式会在第一次行高修正后自动关闭，
   现象是「运行中不再自动滚动」且没有任何报错。贴底还要**钉两次**（`nextTick` + 160ms 补钉），
   否则尾部的估算行高被实测修正后又会出现一段空隙。

> 另外：不要给根节点加 `* { transition-duration: 0s !important }` 这类全局"去动画"通配符 ——
> 它会打断 Monaco 的光标绘制。

## 与其他前端目录的关系

| 目录 | 定位 |
|---|---|
| `frontend/web-shell` | 前端主壳应用（插件化装配） |
| `frontend/modules/*` | 源码级前端插件，接入主壳菜单/路由 |
| `frontend/agent-memory-ui` | agent-memory 的独立前端应用（可单独运行） |
| `frontend/agent-harness-ui` | **本目录**，Agent Harness 评测工作台的独立前端应用 |

本应用为独立运行形态，不依赖主壳；后续如需接入主壳，把 `components/` 与 `composables/` 平移进 `frontend/modules/` 下的插件即可（组合式函数与主壳无耦合）。
