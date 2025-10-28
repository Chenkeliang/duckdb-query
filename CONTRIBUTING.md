# Contributing to DuckQuery · DuckDB Visual Analytics

感谢关注 DuckQuery！为了帮助社区协作，请在提交 Issue、Pull Request 前阅读以下指南。

## 快速链接

- [项目首页](https://github.com/Chenkeliang/duckdb-query)
- [产品介绍（GitHub Pages）](https://chenkeliang.github.io/duckdb-query/)
- [Issues 列表](https://github.com/Chenkeliang/duckdb-query/issues)
- [Discussions](https://github.com/Chenkeliang/duckdb-query/discussions)
- [DuckDB 快速上手指南](docs/duckdb-getting-started.md)

## 提交 Issue

- **Bug**：使用 `.github/ISSUE_TEMPLATE/bug_report.md` 模板，尽量提供复现步骤、DuckDB 版本、日志和示例数据；
- **功能需求**：使用 `feature_request.md` 模板，说明业务场景以及想要的 DuckDB 支持；
- 如果不确定分类可在 Discussions 开个讨论，先交流需求或实现思路。

## 开发环境

1. Fork & 克隆仓库：`git clone https://github.com/<yourname>/duckdb-query.git`
2. 安装依赖：
   - 后端：`cd api && pip install -r requirements.txt`
   - 前端：`cd frontend && npm install`
3. 启动：
   - Docker 一键：`./quick-start.sh`
   - 本地开发：`uvicorn main:app --reload`（在 `api/`），`npm run dev`（在 `frontend/`）

## 代码规范

- Python 遵循 PEP 8，使用类型注解、Docstring；
- JavaScript/React 使用 ES Module + Hooks，遵循现有组件命名；
- CSS/样式尽量复用 `frontend/src/styles/modern.css` 定义的 token；
- 提交前运行：
  - `python -m pytest api/tests`
  - `npm run lint`

## 提交 Pull Request

- 从 `main` 或最新的功能分支切出 feature 分支；
- 保持提交粒度清晰，建议遵循 `feat: …` / `fix: …` 等 commit 信息；
- 填写 PR 模板，包括测试清单、DuckDB 版本；
- CI 通过后再请求 Review；
- 如需变更配置或文档，别忘了同步更新 README / docs。

## 发布与文档

- 增加新功能后，请在 `docs/` 目录补充说明，或更新 `docs/index.html` 页面；
- 如涉及 DuckDB 版本/扩展调整，请在 Release Notes 中写清兼容性要求。

## 行为准则

DuckQuery 遵循 [Contributor Covenant](https://www.contributor-covenant.org/) 1.4 版本。任何形式的骚扰或歧视行为都不被允许，如有问题请通过 Issue/邮箱联系维护者。

感谢你的贡献！🦆
