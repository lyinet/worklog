# AGENTS.md

给在这个仓库里干活的 agent 的约定。先读 README 了解产品和分层。

## 硬性规则

1. **`src/domain/` 不许 import React、不许碰 DOM、不许用 `window`/`document`。** 这是纯逻辑层，必须能在 Node 里跑测试。
2. **时间分桶一律用 `dayKey()`（本地时区）**，不要用 `toISOString().slice(0,10)`，会跨时区错一天。
3. **改 domain 必须补测试**。`pnpm test` 必须全绿才算完成。
4. **提交前跑 `pnpm build`**（含 `tsc -b`），类型错误不许留。
5. **不要引入状态管理库**。当前 `useEntries` 一个 hook 够用；要加状态先说清楚为什么。
6. **不要动别的 agent 的文件**。并行开发时只改分配给你的目录，需要改共享文件（`App.tsx`、`package.json`、`vite.config.ts`）时说明原因，由集成方合并。
7. **不要改 `domain/tags.ts` 的正则语义**（`#标签` 的边界规则），除非任务明确要求；改了要同步更新测试。

## 风格

- 中文文案，短、直白。
- Tailwind 工具类直接写，不建 CSS 文件；重复的视觉常量可以提组件。
- 组件放 `src/components/`，一个文件一个组件，具名导出 + 默认无。
- 类型放 `src/domain/types.ts` 或组件本地，不建 `types/` 大杂烩。

## 验证 UI 的方式

```bash
pnpm dev
# 另开终端：CDP 截图（无头 Chrome）
node /tmp/shot.mjs "http://localhost:5199/?demo=1" /tmp/out.png 390 844
```

截图后真的看一眼，别只信编译通过。

## 提交信息

```
feat(scope): 一句话说做了什么
fix(scope): ...
```

scope 用 `domain` / `storage` / `ui` / `pwa` / `android`。
