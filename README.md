# 工作簿 (Worklog)

记工作用的安卓 App。核心不是"管理任务"，是**3 秒内把刚做的事记下来**：拿起手机 → 输入框已经聚焦 → 打一句 → 回车 → 完事。

## 产品原则

1. **记录速度 > 一切**。任何增加一步操作的功能都要先证明自己值得。
2. **不强迫分类**。标签在正文里用 `#标签` 写，随手就带上了，不填也能记。
3. **离线优先**。无网可用，数据只存在本机。
4. **不留垃圾**。没有「未完成」状态、没有积分、没有打卡 KPI。

## 现在能做什么

- 快速记录（时间戳自动带上）
- 行内 `#标签` 自动识别、高亮、可点击筛选
- 时间线按天分组（今天 / 昨天 / 前天 / 具体日期）
- 搜索正文与标签，标签筛选
- 点条目展开：编辑 / 复制 / 删除（二次确认后 5 秒内可撤销）
- 导出 Markdown（按天分组）与 JSON 备份（文件名精确到分钟）
- 从 JSON 备份恢复：合并而非覆盖，同 id 保留 updatedAt 较新的那条
- 空状态引导：两行说明 +「试试记一条」直接聚焦输入框
- 顶部实时统计：今天 / 本周 / 总计

## 技术栈

- **Vite + React 19 + TypeScript**（strict，`noUncheckedIndexedAccess`）
- **Tailwind CSS v4**（`@tailwindcss/vite`，无配置文件，token 在 `src/index.css`）
- **IndexedDB**（`idb`）持久化，通过 `EntryStore` 接口抽象
- **Vitest** 测纯逻辑
- 计划用 **Capacitor** 打安卓 APK

## 目录结构

```
src/
  domain/        纯逻辑，无 DOM、无 React。测试覆盖率的主战场
    types.ts       Entry / DayGroup 类型
    tags.ts        #标签 解析、剥离、分词、增删
    time.ts        本地日期、时间格式化、周起点
    grouping.ts    按天分组
    search.ts      子串搜索 + 标签筛选
    stats.ts       今日/本周/标签计数
    export.ts      Markdown / JSON 导出
    import.ts      备份校验 + 按 id 合并
    entries.ts     创建、编辑、排序
  storage/
    types.ts       EntryStore 接口 + MemoryStore
    idb.ts         IndexedDB 实现
  state/
    useEntries.ts  加载/新增/更新/删除，乐观更新 + 失败回滚
    importBackup.ts 导入落库编排（纯 async，可在 Node 里测）
  components/      UI，深色移动优先
  dev/demo.ts      仅开发期：?demo 灌样例数据
```

**分层纪律**：`domain/` 不允许 import React 或碰 DOM。想加功能先进 domain 写纯函数 + 测试，再接 UI。存储要换 SQLite 时只改 `storage/`，domain 和组件不动。

## 删除可撤销为什么关掉网页也不丢

只用现有的 `EntryStore`（IndexedDB），不引 localStorage / 第二个 object store / 新依赖：

1. 点删除时**不 delete**，而是把原记录带上 `deleteAfter = 到期时间` 写回同一个 store。原文、标签、时间戳和「删除意图 + 倒计时」一起落盘，条目从列表隐藏（`domain/removal.ts` 的纯函数算状态，`state/removalEffects.ts` 落地）。
2. 真正删除前，先把「已确认删除」的墓碑改写成过期标记（`deadline=0`）写回库里，作为写前日志。这样超时 / 二次删除后哪怕 `store.delete` 没跑完就崩，重开时 `reconcileRemovals` 也会补删，不会把用户确认过的删除偷偷回滚。
3. 重开页面扫库：没过期的窗口继续可撤销（剩余时间按绝对 deadline 算，关多久都不重置 5 秒），过期的补提交，多条残留只保留最新一条。

单条 `put` / `delete` 是原子的，全程只有一个存储，所以不存在「两个存储各写了一半」的不一致窗口；计时器只是提醒，库里的标记才是事实。副作用串行排队，撤销和倒计时同时到达也不会变成半状态。

## 开发

```bash
pnpm install
pnpm dev          # http://localhost:5199
pnpm test         # 纯逻辑测试
pnpm build        # 类型检查 + 生产构建
```

看带数据的效果：`http://localhost:5199/?demo=1`（空库时灌 8 条样例，不污染已有数据）。

## 约定

- 文案用中文，短句，不用营销腔。
- 时间一律用本地时区。禁止 `toISOString()` 做日期分桶。
- 颜色写在 class 里（`#0b0b0c` 深底、`#7ee2a8` 薄荷绿强调色）。
- 移动端触控目标 ≥ 40px；底部输入条必须避开安全区（`.safe-bottom`）。
- 删除、清空一律二次确认。
- 新增 UI 前先问：这会不会让"记一条"变慢？

## Roadmap

- [ ] PWA：manifest + 图标 + Service Worker，可装到桌面、断网可用
- [ ] Capacitor 安卓壳，出 APK
- [ ] 统计页：标签分布、连续记录天数、周对比
- [x] 删除后 5 秒内可撤销
- [ ] 桌面小部件 / 通知栏快捷记录（需原生插件）
- [ ] 语音输入
