# Task 工作流说明

## 状态转换

```
new → brainstormed → planned → executing → completed
```

## 各状态说明

- **new**: Task 刚创建，尚未进行需求澄清
- **brainstormed**: 已完成 brainstorming-task 需求澄清
- **planned**: 已生成 TDD 实现计划（writing-plans）
- **executing**: 正在执行实现
- **completed**: 已完成实现

## 自动化行为

1. **new → brainstormed**: 首次打开 Task 自动导航到 brainstorm 页面（仅限 Story 下的无描述 Task）
2. **brainstormed → planned**: 用户点击"生成实现计划"按钮
3. **planned → executing**: 用户点击"开始执行"按钮，创建 workspace 后自动更新状态

## 手动干预点

用户可在以下环节手动干预:
- 跳过自动 brainstorm（返回后再打开不会重复触发）
- 修改生成的计划
- 选择执行的 executor profile

## 工作流进度指示

TaskPanel 会显示工作流进度条：
- new: 0%
- brainstormed: 33%
- planned: 66%
- executing: 90%
- completed: 100%

## 手动测试步骤

### 完整工作流测试

1. **创建 Story 和 Task**
   - 在项目中创建新 Story
   - 在 Story 下创建新 Task（不填写 description）

2. **验证自动导航**
   - 点击 Task 卡片
   - 应自动导航到 brainstorm 页面

3. **完成 Brainstorm**
   - 在 brainstorm 页面输入需求
   - 创建 workspace 并完成需求澄清

4. **生成计划**
   - 返回 Task 详情
   - 确认工作流进度显示 33%
   - 点击"生成实现计划"按钮
   - 创建 planning workspace

5. **开始执行**
   - 完成计划后返回 Task 详情
   - 确认工作流进度显示 66%
   - 点击"开始执行"按钮
   - 创建执行 workspace
   - 确认状态自动更新为 'executing'，进度显示 90%

### 边界条件测试

1. **有描述的 Task**: 不应自动导航
2. **Project 下的 Task**: 不应显示 brainstorm 按钮
3. **重复打开**: localStorage 防止重复自动导航

## 故障排除

### 清除自动导航记录

如需重置自动导航功能：

```javascript
// 在浏览器控制台运行
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('task-auto-brainstorm-')) {
    localStorage.removeItem(key);
  }
});
```

### 手动更新 workflow_state

如需手动修改工作流状态（调试用）：

```javascript
// 使用浏览器开发者工具的 Network 标签
// 找到 PATCH /api/tasks/:id 请求
// 在请求体中添加 workflow_state 字段
{
  "title": "...",
  "description": "...",
  "status": "todo",
  "workflow_state": "brainstormed"  // 或其他状态
}
```
