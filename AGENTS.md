# 项目专用 AGENT 规则

## 目录与模块
- 后端 FastAPI 在 `api/`（核心/路由/模型），前端 SPA 在 `frontend/src`，配置在 `config/`，临时/导出数据在 `temp_files/` 与 `exports/`，文档在 `docs/`，Docker 由根目录 `docker-compose.yml` 驱动。
- DuckDB 辅助函数需无状态，接收可选连接参数并调用 `_use_connection()` / `with_duckdb_connection()`，避免模块级长连接。

## 运行与测试
- `python -m uvicorn main:app --reload`（`api/` 内）启动后端；`python -m pytest api/tests -q` 跑后端测试。
- 前端：`npm install && npm run dev` 开发，`npm run lint` 检查，`npm run build` 产出 `frontend/dist`。
- 不做全局安装，避免触碰非项目文件。

## 编码风格
- Python 遵循 PEP 8，新增公共 API 写 docstring 和类型标注；路由/响应模型命名对齐现有模式（如 `visual-query`、`data_sources`）。
- 前端使用 ES modules，组件 PascalCase，hooks/utils camelCase；新增文案遵循既有排版等级。
- 写回 DuckDB 前时间统一为 UTC（naive），参考 `TaskManager._normalize_datetime`。

## UI / CSS / 主题
- 仅使用 `frontend/src/styles/modern.css` 的 `--dq-*` 变量（颜色/圆角/阴影）；如需新值先增 token，再消费，不要硬编码或 `!important`。
- 新布局容器使用 `dq-layout-*` 前缀隔离；背景/hover/active/outline 等都取自 `--dq-*`。
- 共享组件优先：`CardSurface`、`RoundedButton`、`RoundedTextField`、`SectionHeader`；自定义前先复用。
- 禁用原生 `alert/confirm/prompt`，使用共享对话框样式 `.dq-dialog` 或现有示例。
- 图标：新布局/导航统一用 `lucide-react`，Sidebar/Header 避免 MUI；Logo 随主题切换 `Duckquerylogo.svg` / `duckquery-dark.svg`，禁止 `invert()`。

## 布局与主题切换
- 新入口可用 Tailwind + shadcn，但必须映射到 `--dq-*` CSS 变量，通过 `data-theme="light|dark"` 或类名切换；不新增零散 CSS。
- Sidebar/Header 固定，内容区滚动；确保表格/编辑器内部滚动不被裁剪。为小屏定义最小宽度与 Sidebar 折叠策略。

## 状态与入口
- 状态集中在 `useDuckQuery`，返回 `{state, actions}`，供旧 `ShadcnApp` 与新 `DuckQueryApp` 共用；不要改 `UnifiedQueryInterface` 内部，只传 props。
- 如后续采用状态机，先在 `useDuckQuery` 内用明确的 action/事件演进，避免一次性重写。

## 多语言
- 新布局引入/复用 i18n provider，新文案用翻译 key，设置默认回退，避免缺 key 空白。

## 文档与提交
- 行为变更必须更新 `docs/CHANGELOG.md`；仅在范围变更时改 `README.md` / 入门 / 集成指南。
- 配置示例保持脱敏（`config/*.example`），提交前清理敏感的 `temp_files/`。
- 提交信息用小写前缀（`feat:`、`fix:` 等）+ 现在时简述，保持变更范围清晰，不回滚用户已有或无关改动。

## 兼容性检查清单
- 明/暗模式对比度、残留硬编码颜色（分页/悬浮态等）需归一到 `--dq-*`。
- 导航图标与线条在暗色下可见；按钮/输入 hover/active/disabled 态均映射到 tokens。
- 响应式断点与滚动表现符合预期；Logo 按主题切换。

## 代理约束
- 未经指示不修改代码；仅分析则不动代码。
- 避免新增 `!important`，优先复用 tokens/组件；必要的新样式先问清需求。
