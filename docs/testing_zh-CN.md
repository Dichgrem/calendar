# 测试

## 单元测试 (`just test`)

Vitest workspace 模式: server (node) + web (jsdom)。14 测试文件，98 测试。

```bash
just test          # 运行所有单元测试
just test-watch    # 监听模式
```

### 服务端测试 (node 环境)

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `ics-parser.test.ts` | 6 | ICS 基础解析 |
| `ics-serializer.test.ts` | 7 | ICS 序列化 |
| `ics-edge.test.ts` | 9 | RFC 5545 行展开、VALARM、SSRF |
| `sync.test.ts` | 8 | LWW 冲突、pull/push 协议 |
| `auth.test.ts` | 8 | scrypt 哈希、密码验证 |
| `calendar-reorder.test.ts` | 6 | splice 索引修正 |

### 前端测试 (jsdom 环境)

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `modal.test.tsx` | 8 | ESC/背景关闭、INPUT 守卫 |
| `EventEditor.component.test.tsx` | 9 | 创建/编辑模式、全天事件 |
| `EventEditor.test.ts` | 9 | toLocalInput、roundToNextHour、拆分合并 |
| `LoginPage.test.tsx` | 7 | 注册/登录表单、加载态 |
| `ColorSwatchPicker.test.tsx` | 3 | 颜色按钮、onChange |
| `CalendarManagement.test.ts` | 4 | 常用日历导入检测 |
| `date-format.test.ts` | 5 | 中文/英文/自定义日期格式 |

### 测试基础设施

- `vitest.workspace.ts` — workspace 配置引用 server/web
- `packages/server/vitest.config.ts` — node 环境
- `packages/web/vitest.config.ts` — jsdom + `@testing-library/jest-dom`
- `packages/web/src/test-setup.ts` — jsdom 匹配器

## API 集成测试 (`just test-*` 配方)

基于 Shell 的 `curl` + `jq` 测试。需要先启动测试服务器：

```bash
# 终端 1: 启动测试服务器
just test-run

# 终端 2: 运行测试
just test-all        # 全部测试
just test-full       # 完整集成测试
just test-it login   # 单个测试
```

## 测试计划

### 认证
- [ ] 首次访问 → `auth/status` 返回 `registered: false`
- [ ] 注册 → 返回 201，设置 session cookie
- [ ] 重复注册 → 返回 403
- [ ] 正确/错误密码登录 → 200 / 401

### 日历
- [ ] 增删改查 + 拖拽排序
- [ ] 注册时自动创建默认日历

### 事件
- [ ] 增删改查 + 软删除
- [ ] 日期范围查询 + 重复事件

### ICS
- [ ] 预览 / URL 抓取 / 导入 / 导出
- [ ] 覆盖模式

### 同步
- [ ] GET /sync/pull 返回增量
- [ ] POST /sync/push LWW 冲突检测

### 前端
- [ ] 日历月视图 + 日期点击高亮
- [ ] 事件创建/编辑弹窗
- [ ] 搜索键盘导航（方向键 + esc）
- [ ] 深色模式切换 + 持久化
- [ ] 日历拖拽排序
- [ ] 常用日历导入去重
- [ ] 登录/注册流程
- [ ] 设置持久化

### 平台
- [ ] Cloudflare Workers: 部署 + 验证
- [ ] Node.js: `just start` + 测试
- [ ] Docker: 构建 + 测试
