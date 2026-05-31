# 测试

暂无自动化测试套件。以下是基于 shell 的 API 测试和手动测试计划。

## API 测试（`just test-*` 命令）

需要在一个终端启动测试服务器：

```bash
# 终端 1：启动测试服务器
just test-run

# 终端 2：运行测试
just test-all        # 全部测试
just test-full       # 完整集成测试
just test-login      # 单个测试
```

测试使用 `curl` + `jq`，基于 cookie 认证（凭据：`admin` / `admin123`）。

## 测试计划

### 认证

- [ ] 首次访问 → `auth/status` 返回 `registered: false`
- [ ] 注册 → 返回 201，设置 session cookie
- [ ] 重复注册 → 返回 403
- [ ] 正确密码登录 → 返回 200，设置 session cookie
- [ ] 错误密码登录 → 返回 401
- [ ] 无 cookie 访问受保护端点 → 返回错误

### 会话

- [ ] 有效 cookie → 所有受保护端点通过
- [ ] 无 cookie → 受保护端点被拒绝
- [ ] 登出 → cookie 失效，后续请求被拒
- [ ] 修改密码 → 验证旧密码，设置新密码

### 日历

- [ ] `GET /api/calendars` → 返回日历列表
- [ ] `POST /api/calendars` → 创建日历（名称 + 颜色）
- [ ] `GET /api/calendars/:id` → 返回日历详情
- [ ] `PATCH /api/calendars/:id` → 更新名称/颜色
- [ ] `DELETE /api/calendars/:id` → 删除日历
- [ ] 注册时自动创建默认日历

### 事件

- [ ] `POST /api/calendars/:cid/events` → 创建事件（标题、日期、描述）
- [ ] `GET /api/calendars/:cid/events?start=&end=` → 按日期范围返回事件
- [ ] `GET /api/events/:id` → 返回事件详情
- [ ] `PATCH /api/events/:id` → 更新事件字段
- [ ] `DELETE /api/events/:id` → 软删除事件
- [ ] 带 RRULE 的事件 → 重复事件正确解析

### ICS

- [ ] `POST /api/ics/preview` → 解析 ICS 并返回事件预览
- [ ] `POST /api/ics/fetch-url` → 获取远程 ICS URL
- [ ] `POST /api/ics/import` → 导入事件到日历
- [ ] `GET /api/calendars/:cid/ics/export` → 导出日历为 ICS
- [ ] 导出保留 VALARM、CATEGORIES、STATUS（通过 raw_ics）
- [ ] `overwrite: true` 导入 → 先清空日历再导入

### 设置

- [ ] `GET /api/settings` → 返回默认设置
- [ ] `PATCH /api/settings` → 更新语言、每周首日、显示事件时间、日期格式、显示农历
- [ ] 设置跨会话保持

### 同步

- [ ] `GET /api/sync/pull?last_pulled_seq=0` → 返回所有变更
- [ ] `POST /api/sync/push` → 推送本地变更
- [ ] 变更包含 created/updated/deleted 追踪

### 备份

- [ ] `POST /api/backup` → 创建备份文件
- [ ] `GET /api/backups` → 列出可用备份
- [ ] `GET /api/backup/download/:filename` → 下载备份
- [ ] `POST /api/backup/restore` → 从备份恢复

### 界面

- [ ] 日历页面加载月视图
- [ ] 首次访问显示注册页面
- [ ] 登录 → 跳转到日历视图
- [ ] FAB 按钮创建事件 → 显示在日历上
- [ ] 点击事件 → 打开编辑弹窗
- [ ] 搜索事件 → 筛选结果，点击跳转到日期
- [ ] 农历开关 → 显示/隐藏农历日期
- [ ] 导入常用日历 → 添加节假日日历
- [ ] ICS 导入页面 → 文件上传和 URL 标签页正常
- [ ] ICS 导出对话框 → 多选日历，下载
- [ ] 深色模式切换正常
- [ ] 登出 → 返回登录页
- [ ] 移动端响应式布局

### 平台适配器

- [ ] Cloudflare Workers：部署并验证所有端点
- [ ] Node.js：`just start` 本地测试所有端点
- [ ] Docker：构建并测试所有端点
