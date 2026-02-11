# Task 标签系统设计：视觉分类 + Brainstorm 技能注入

> 日期：2026-02-11
> 状态：设计完成，待实施

---

## 一、目标

在 Task 卡片上添加预定义标签，实现两个能力：

1. **视觉分类** — 看板卡片通过左侧色条直观区分任务类型，支持按标签筛选
2. **技能注入** — Task 进入 brainstorm 阶段时，根据标签自动注入上下文，让 AI 针对性地引导需求澄清

## 二、核心决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 标签来源 | 预定义固定集合（7 个） | 一致性强，技能映射确定，避免碎片化 |
| 标签数量 | 单标签（每个 Task 最多一个） | Task 应是单一职责的原子单元 |
| 视觉方案 | 左侧色条 + tooltip | 经典看板方案，不占额外空间 |
| 触发方式 | Brainstorm 阶段 Prompt 前缀注入 | 隐式注入，无额外操作负担 |
| 与现有 Tag 系统的关系 | 独立概念 | 现有 Tag 是项目级配置模板，Task 标签是任务级分类 |

## 三、预定义标签集合

| 标签名 | 显示名 | 颜色 | Tailwind 类 | 关联技能 |
|--------|--------|------|-------------|---------|
| `ui-design` | UI 设计 | 蓝色 | `border-blue-500` | leone-ui2code, leone-form |
| `api` | API | 绿色 | `border-green-500` | leone-api, leone-crud |
| `bugfix` | Bug 修复 | 红色 | `border-red-500` | systematic-debugging |
| `refactor` | 重构 | 橙色 | `border-orange-500` | leone-review, leone-code |
| `infra` | 基础设施 | 紫色 | `border-purple-500` | leone-team |
| `docs` | 文档 | 青色 | `border-cyan-500` | story-doc-generator |
| `test` | 测试 | 黄色 | `border-yellow-500` | test-driven-development |

## 四、数据模型

### 数据库迁移

```sql
ALTER TABLE tasks ADD COLUMN tag TEXT DEFAULT NULL;
```

不需要关联表。标签的颜色、技能映射、注入 prompt 由前端配置静态定义，不入库。

### Rust 模型

新增 `TaskTag` 枚举：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, TS, Display)]
#[sqlx(type_name = "TEXT", rename_all = "kebab-case")]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
#[ts(export)]
pub enum TaskTag {
    UiDesign,
    Api,
    Bugfix,
    Refactor,
    Infra,
    Docs,
    Test,
}
```

Task 结构体扩展：

```rust
pub struct Task {
    // ... 现有字段
    pub tag: Option<TaskTag>,
}
```

CreateTask / UpdateTask 同步增加 `tag: Option<TaskTag>` 字段。

### TypeScript 类型（自动生成）

```typescript
export type TaskTag = "ui-design" | "api" | "bugfix" | "refactor" | "infra" | "docs" | "test";

export type Task = {
    // ... 现有字段
    tag: TaskTag | null;
};
```

## 五、前端视觉呈现

### TaskCard 左侧色条

在 KanbanCard 组件上根据 `tag` 渲染 4px 宽左边框色条，无标签时无色条。

```
┌──────────────────────────────┐
█ 实现用户登录页面      ⚙️ ↻ ⋯ │  ← 蓝色左边框 = ui-design
│ 用户登录页面的表单...         │
└──────────────────────────────┘

┌──────────────────────────────┐
│ 修复分页逻辑错误       ⚙️ ⋯ │  ← 无色条 = 无标签
│ 当页码超出范围时...          │
└──────────────────────────────┘
```

鼠标悬停色条区域时，显示 tooltip 显示标签名称。

### TaskFormDialog 标签选择器

在创建/编辑 Task 的对话框中增加标签选择器：7 个色块按钮横排，点选高亮，再点取消选择。无需下拉框。

### 看板筛选

TaskKanbanBoard 顶部增加一排筛选芯片：

```
[全部] [●UI设计] [●API] [●Bug修复] [●重构] [●基础设施] [●文档] [●测试]
```

- 默认选中"全部"，显示所有卡片
- 点选某标签芯片，前端过滤仅显示该标签的卡片（不需要 API 改动）
- 单选模式，点击已选中的标签回到"全部"
- 仅在 Task 看板显示，Story 看板不需要（标签是 Task 级概念）

## 六、Brainstorm 阶段 Prompt 注入

### 机制

当带标签的 Task 进入 brainstorming-task 技能时，系统在 prompt 前自动拼接一段上下文指令。

### 注入文本

存储在前端配置文件 `frontend/src/config/task-tags.ts` 中：

| 标签 | 注入内容 |
|------|---------|
| `ui-design` | 本任务是 UI 设计任务。请重点关注：页面布局与信息层级、交互流程与状态变化、响应式适配策略、组件拆分粒度、样式方案（Tailwind 类名组织）。在技术方案章节建议使用 leone-ui2code 处理设计稿/截图。 |
| `api` | 本任务是 API 开发任务。请重点关注：接口路径与 HTTP 方法设计、请求/响应数据结构、错误码定义、权限校验、数据库查询优化。建议使用 leone-api 生成端点骨架。 |
| `bugfix` | 本任务是 Bug 修复任务。请重点关注：问题复现步骤、根因分析、影响范围评估、回归风险。建议使用 systematic-debugging 技能定位根因。 |
| `refactor` | 本任务是代码重构任务。请重点关注：现有代码问题诊断、重构目标与约束、兼容性影响、测试覆盖。建议使用 leone-review 先做代码审查。 |
| `infra` | 本任务是基础设施任务。请重点关注：环境配置、部署流程、脚本可靠性、回滚方案。 |
| `docs` | 本任务是文档任务。请重点关注：目标读者、文档结构、与代码的同步策略、示例完整性。 |
| `test` | 本任务是测试任务。请重点关注：测试策略（单元/集成/E2E）、边界条件覆盖、测试数据准备、断言质量。建议使用 test-driven-development 技能。 |

### 注入位置

brainstorming-task 技能调用时，检查当前 Task 的 `tag` 字段。如果非空，从配置中取出对应注入文本，拼接到发送给 AI 的 prompt 之前。

## 七、改动范围

| 层 | 文件 | 改动内容 |
|----|------|---------|
| DB | `crates/db/migrations/新迁移.sql` | tasks 表加 tag 字段 |
| Rust 模型 | `crates/db/src/models/task.rs` | TaskTag 枚举，Task/CreateTask/UpdateTask 扩展 |
| API | `crates/server/src/routes/tasks.rs` | 创建/更新接口支持 tag 字段 |
| 类型同步 | `shared/types.ts` | 自动生成 |
| 前端配置 | `frontend/src/config/task-tags.ts`（新建） | 标签颜色、显示名、注入文本定义 |
| 前端组件 | `frontend/src/components/tasks/TaskCard.tsx` | 左侧色条 + tooltip |
| 前端组件 | `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx` | 标签选择器 |
| 前端组件 | `frontend/src/components/tasks/TaskKanbanBoard.tsx` | 筛选芯片 |
| 技能 | `brainstorming-task/skill.md` | 读取 tag 拼接 prompt 前缀 |
| SQLx | 离线查询缓存 | prepare-db 更新 |

## 八、不改动

- 现有 Tag 系统（TagManager、TagEditDialog、tags API）— 独立概念，互不影响
- Story 数据模型 — 标签仅用于 Task 级别
- 现有工作流状态机 — 标签不影响 WorkflowState 转换

## 九、非目标

- 标签统计/报表
- 标签与优先级/复杂度联动
- 用户自定义标签
- 多标签
- 执行阶段快速操作按钮（可作为后续迭代）
