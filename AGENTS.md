## Project Execution Rules (Spec-Kit × Superpowers)

> 本文件定义 Claude Code 在本仓库中的执行规则。  
> 项目结构、命令、规范等**事实信息**以现有 Repository Guidelines 为唯一事实来源。  
> 若本文件与用户级 ~/.claude/CLAUDE.md 冲突，以本文件为准。

---

## 一、权威事实来源（不可推翻）

Claude 必须将 Repository Guidelines 中描述的以下内容视为已确认事实：
- 项目结构与模块职责
- Rust / TypeScript 技术栈与命名规范
- 构建、测试、类型生成、SQLx、CLI 命令
- Story / Task 文档结构与 API
- QA 模式与安全 / 配置约定

Claude 不得自行重构、推翻或“优化”这些约定，除非任务明确要求。

---

## 二、项目级开发哲学

- Story / Task 驱动，而不是文件驱动
- Rust ↔ TypeScript 类型同步是系统边界
- 文档是一等产物，与代码同等重要
- 可验证性优先于实现速度

---

## 三、强制工作流（本项目专用）

### 阶段 0：思考与对齐（必做）

在任何代码改动前，Claude 必须启用 sequential-thinking：
- 明确涉及的 Story / Task
- 识别受影响的 crate / frontend 模块
- 判断是否涉及 shared types、API 或文档
- 明确测试与 QA 路径

若以上任一不清楚，禁止进入编码。

---

### 阶段 1：规格阶段（Spec-Kit）

对任何非微小改动，必须使用：

- `/speckit.specify`  
  明确目标、影响范围、验收条件（含测试与文档）

规格产物：
```
.claude/spec-[任务名].md
```

---

### 阶段 2：计划与任务（Spec-Kit）

- `/speckit.plan`  
  明确后端 / 前端 / shared types / 测试分工

- `/speckit.tasks`  
  将计划拆解为可验证任务

产物：
```
.claude/plan-[任务名].md
.claude/tasks-[任务名].md
```

---

### 阶段 3：执行阶段（Superpowers）

以下情况必须进入 Superpowers 执行战术（即使未显式调用）：
- 多 crate 或多 frontend 模块修改
- API 或 shared types 变更
- 文档与代码需同步更新
- 测试失败或行为不确定

执行要求：
- 测试 / check / generate-types 优先
- 小步修改，避免跨层一次性提交
- 记录执行过程到：
```
.claude/operations-log.md
```

---

### 阶段 4：验证与回写

实现完成后，Claude 必须：
- 运行相关测试与检查
- 确认 Story / Task 文档与实现一致
- 如涉及类型，确认已重新生成

输出：
```
.claude/verification-report.md
```

---

## 四、文档与代码同步红线

- 禁止只改代码不改 Story / Task 文档
- 禁止手动修改 shared/types.ts
- 禁止在不明确验证路径的情况下提交

---

## 五、微小改动逃生舱（严格）

仅当同时满足：
- 单文件
- < 20 行
- 不影响 API / 类型 / 文档
- 不涉及 Story / Task

才允许简化流程，但仍需通过测试。

---

## 六、最终保险规则

当不确定是否需要 Spec-Kit 或 Superpowers 时，必须选择需要。
