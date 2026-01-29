export function buildTaskBrainstormPrompt(
  taskTitle: string,
  taskDescription: string | null | undefined
): string {
  const descSection = taskDescription
    ? `\n\n**现有描述：**\n${taskDescription}`
    : '';

  return `/brainstorming

帮我澄清「${taskTitle}」这个任务的需求细节。${descSection}

## 你的任务

1. **先问我 2-3 个关键问题**，了解任务的具体要求、边界条件、验收标准
2. **逐步澄清**：每次一个问题，根据我的回答追问或进入下一个问题
3. **最终生成需求摘要**，包含：
   - 核心需求点
   - 边界条件和约束
   - 技术实现要点
   - 验收标准

## 输出格式

当你准备好生成最终摘要时，请用以下格式：

\`\`\`markdown
## 需求细节

### 核心需求
- ...

### 边界条件
- ...

### 技术要点
- ...

### 验收标准
- [ ] ...
\`\`\`

---

让我们开始吧，请提出第一个问题：
`;
}
