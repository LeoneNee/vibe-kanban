import type { TaskTag } from 'shared/types';

export interface TaskTagConfig {
  label: string;
  color: string; // Tailwind border color class
  bgColor: string; // Tailwind background color class (for filter chips)
  dotColor: string; // Tailwind dot color class (for filter chips)
  injectionPrompt: string;
}

export const TASK_TAG_CONFIGS: Record<TaskTag, TaskTagConfig> = {
  'ui-design': {
    label: 'UI 设计',
    color: 'border-l-blue-500',
    bgColor: 'bg-blue-500/10',
    dotColor: 'bg-blue-500',
    injectionPrompt:
      '本任务是 UI 设计任务。请重点关注：页面布局与信息层级、交互流程与状态变化、响应式适配策略、组件拆分粒度、样式方案（Tailwind 类名组织）。在技术方案章节建议使用 leone-ui2code 处理设计稿/截图。',
  },
  api: {
    label: 'API',
    color: 'border-l-green-500',
    bgColor: 'bg-green-500/10',
    dotColor: 'bg-green-500',
    injectionPrompt:
      '本任务是 API 开发任务。请重点关注：接口路径与 HTTP 方法设计、请求/响应数据结构、错误码定义、权限校验、数据库查询优化。建议使用 leone-api 生成端点骨架。',
  },
  bugfix: {
    label: 'Bug 修复',
    color: 'border-l-red-500',
    bgColor: 'bg-red-500/10',
    dotColor: 'bg-red-500',
    injectionPrompt:
      '本任务是 Bug 修复任务。请重点关注：问题复现步骤、根因分析、影响范围评估、回归风险。建议使用 systematic-debugging 技能定位根因。',
  },
  refactor: {
    label: '重构',
    color: 'border-l-orange-500',
    bgColor: 'bg-orange-500/10',
    dotColor: 'bg-orange-500',
    injectionPrompt:
      '本任务是代码重构任务。请重点关注：现有代码问题诊断、重构目标与约束、兼容性影响、测试覆盖。建议使用 leone-review 先做代码审查。',
  },
  infra: {
    label: '基础设施',
    color: 'border-l-purple-500',
    bgColor: 'bg-purple-500/10',
    dotColor: 'bg-purple-500',
    injectionPrompt:
      '本任务是基础设施任务。请重点关注：环境配置、部署流程、脚本可靠性、回滚方案。',
  },
  docs: {
    label: '文档',
    color: 'border-l-cyan-500',
    bgColor: 'bg-cyan-500/10',
    dotColor: 'bg-cyan-500',
    injectionPrompt:
      '本任务是文档任务。请重点关注：目标读者、文档结构、与代码的同步策略、示例完整性。',
  },
  test: {
    label: '测试',
    color: 'border-l-yellow-500',
    bgColor: 'bg-yellow-500/10',
    dotColor: 'bg-yellow-500',
    injectionPrompt:
      '本任务是测试任务。请重点关注：测试策略（单元/集成/E2E）、边界条件覆盖、测试数据准备、断言质量。建议使用 test-driven-development 技能。',
  },
};

export const ALL_TASK_TAGS: TaskTag[] = Object.keys(
  TASK_TAG_CONFIGS
) as TaskTag[];
