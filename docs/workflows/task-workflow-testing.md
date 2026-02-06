# Task 工作流测试检查清单

## 数据库层

- [ ] workflow_state 字段存在于 tasks 表
- [ ] 默认值为 'new'
- [ ] CHECK 约束包含所有 5 个状态
- [ ] 索引 idx_tasks_workflow_state 存在

## 后端 API

- [ ] Task 结构体包含 workflow_state
- [ ] CreateTask 可以指定 workflow_state
- [ ] UpdateTask 可以更新 workflow_state
- [ ] Task::update_workflow_state 方法工作正常
- [ ] 所有查询返回 workflow_state

## 前端类型

- [ ] WorkflowState 类型正确导出
- [ ] Task 接口包含 workflow_state
- [ ] CreateTask/UpdateTask 中 workflow_state 为可选
- [ ] TypeScript 编译无错误

## UI 组件

- [ ] TaskPanel 显示工作流进度条
- [ ] 进度百分比正确（0/33/66/90/100）
- [ ] "下一步"提示正确显示
- [ ] 按钮根据状态显示/隐藏
- [ ] 按钮文本正确（Brainstorm/Review，生成实现计划，开始执行）

## 自动化行为

- [ ] 新 Task 首次打开自动导航到 brainstorm
- [ ] localStorage 防止重复自动导航
- [ ] 点击"生成实现计划"更新状态并打开对话框
- [ ] 点击"开始执行"更新状态并打开对话框
- [ ] 创建 workspace 后自动更新为 'executing'

## 边界条件

- [ ] 有描述的 Task 不自动导航
- [ ] Project 下的 Task 不显示 brainstorm 按钮
- [ ] 不同 workflow_state 显示正确的 UI

## 性能

- [ ] 工作流 Hook 使用 useMemo 优化
- [ ] 进度条动画流畅
- [ ] 无不必要的重新渲染

## 兼容性

- [ ] 现有 Task 自动获得 'new' 状态
- [ ] API 向后兼容（workflow_state 可选）
- [ ] 不影响现有工作流
