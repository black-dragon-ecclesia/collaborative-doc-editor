# Bug 记录

本项目开发过程中实际遇到并修复的问题，按「错误现象 / 错误描述 / 排错过程 / 错误原因分析」记录，用于复盘与答辩说明。

---

## Bug 1：双端同时编辑，内容互相整篇覆盖

**1. 错误现象**

两个浏览器窗口打开同一文档，A 输入 `abc`、B 输入 `def`，结果是一端的内容把另一端整篇冲掉，只剩最后一次编辑的结果，且两端不一致。

**2. 错误描述**

协同初期采用「全量广播」：客户端内容变化时把整篇 `content` 通过 socket 发出，接收端直接替换编辑器全文。

**3. 排错过程**

- DevTools 网络面板「消息」标签看 socket 帧，发现 `remoteContent` 到达时携带的是对方整篇文本，而不是增量；
- 在接收回调里打印本地文本与远端文本，确认每次都是无条件覆盖；
- 缩小场景：A 打一个字、B 打一个字，最终只剩后发者的那一个字，前面的全丢。

**4. 错误原因分析**

全量覆盖没有「操作」概念，无法表达「在某个位置插入/删除多少字符」，因此也无法判断两端的并发修改是否可以共存。缺少操作级协议与并发合并机制，任何一次广播都等价于对全文的强制回滚。改为差分操作 `{pos, del, ins}` + OT `transform` 后问题消失。

---

## Bug 2：关闭访客窗口，在线成员列表不消失

**1. 错误现象**

访客关掉分享页后，所有者编辑页顶部的在线列表里仍然显示该访客，刷新页面才清掉。

**2. 错误描述**

`disconnect` 事件里原本用 `for (const room of socket.rooms)` 遍历房间并摘除成员，实际一行都没执行到。

**3. 排错过程**

- 在 `disconnect` 回调里 `console.log(socket.rooms)`，输出是一个空集合；
- 查看 Socket.io 文档与源码行为，确认 `disconnect` 触发时该 socket 已完成离开所有房间的动作，`socket.rooms` 已被清空；
- 改为遍历自定义的内存表 `roomUsers`（`Map<docId, Map<socketId, user>>`），按 `socket.id` 精确匹配摘除。

**4. 错误原因分析**

依赖了框架在特定生命周期阶段已经失效的状态。`disconnect` 是「连接已断开之后」的通知，房间关系此时已不可读。应改为维护自己的成员表，以 `socket.id` 作为唯一键做清理，而不是反查框架内部状态。

---

## Bug 3：`opAck` 未解构，未确认队列只增不减导致内容重复

**1. 错误现象**

协同运行一段时间后，分享页编辑器里凭空多出一行（例如多出一个 `aacdd`），且行数持续膨胀，两端内容分叉。

**2. 错误描述**

`Share.vue` 中写成 `socket.on('opAck', (opId) => { pendingOps.shift() })`，服务端实际发出的是对象 `{ opId }`。

**3. 排错过程**

- 打印 `pendingOps.length`，发现它单调递增从不清零；
- 打印 `opAck` 回调的入参，是一个对象 `{opId: 3}`，而 `pendingOps.shift()` 在空数组上返回 `undefined` 也不报错，掩盖了问题；
- 顺带确认参数顺序：收到 `remoteOp` 时应对本地未确认 op 做变换，代码里却把远端 op 当成已生效方。

**4. 错误原因分析**

协议两端对字段形态的约定不一致（一个传值、一个传对象），且 `shift()` 对空数组静默返回 `undefined`，没有异常暴露。未确认队列永不清空 → 每次收到 `remoteOp` 都把历史 op 当作未确认操作重放一遍，累积出重复字符与多余行。修复为 `socket.on('opAck', ({ opId }) => {...})` 并明确 `transform(localOp, remoteOp)` 的参数顺序。

---

## Bug 4：`transform` 参数顺序写反，坐标修正方向错误

**1. 错误现象**

两端分别在不同位置输入时，远端同步过来的字符插入到错误的位置，出现字符错位、重复或丢字。

**2. 错误描述**

`Editor.vue` 与 `Share.vue` 两处都写成 `transform(remoteOp, localOp)`，而函数语义是「第一个参数已在文档中生效，返回第二个参数修正后的坐标」。

**3. 排错过程**

- 阅读 `ot.js` 中 `transform(opA, opB)` 的实现：`opA` 的 `pos/del/ins` 决定 `delta` 与区间边界，`opB` 只是被平移的对象；
- 构造最小用例：`opA = {pos:0, del:0, ins:'x'}`（在开头插入）、`opB = {pos:0, del:0, ins:'y'}`（也在开头插入）；顺序写反后 `opB` 被当成已生效方，`opA` 的坐标被平移，插入位置前后颠倒；
- 把顺序改为 `transform(localOp, remoteOp)` 后，同位置并发输入结果稳定。

**4. 错误原因分析**

OT 的 `transform` 是有方向的非交换运算，参数顺序即语义。把「已生效操作」与「待修正操作」颠倒后，虽然不会报错、在小范围单点编辑时甚至看不出问题，但在并发场景会系统性偏移。语义正确的顺序是：本地已生效 → 修正远端。

---

## Bug 5：恢复草稿时把基线也改成草稿，导致两端分叉

**1. 错误现象**

刷新页面后点「恢复草稿」，所有者编辑器是 5 行，分享页是 6 行，多出一行 `aacdd`，两端不再一致。

**2. 错误描述**

`Editor.vue` 中恢复草稿的实现同时做了两件事：把编辑器内容设为 `localDraft`，并把差分基线 `lastText` 也设为 `localDraft`。

**3. 排错过程**

- 对比两端行数与内容，确认差异是「分享端多一行」；
- 检查 `watch(docContent)` 的差分来源：`diffToOp(lastText, newText)`；
- 发现 `lastText` 被直接赋值成草稿，等于告诉算法「服务端内容已经和草稿一致」，于是后续真实编辑算出的 diff 只反映「草稿→新内容」这一小段，而接收端基于的是服务端内容，`pos` 坐标基准完全不同；
- 正确做法：只改 `docContent`，不动 `lastText`，让 watch 自然地算出「服务端内容 → 草稿内容」的完整替换 op 并广播。

**4. 错误原因分析**

把「渲染内容」与「差分基线」当成同一个状态。基线表示「上一个已被所有端确认的文本」，任何本地视图跳变都必须通过 op 广播让其他端跟上，而不能私自改动基线。基线一旦被本地状态污染，后续所有 op 的坐标语义都会失真。

---

## Bug 6：新用户加入房间读不到实时内容

**1. 错误现象**

房间内两人正在编辑且尚未落库时，第三人打开同一文档（或分享页），看到的是数据库里最后一次保存的旧内容，与房间内其他人的实时内容不一致；刷新也不解决。

**2. 错误描述**

`joinDoc` 只做了三件事：加入房间、登记在线成员、广播 `userList`，没有下发房间当前的文档状态。

**3. 排错过程**

- 复现：A 编辑但不触发保存，B 通过分享页进入，B 的内容停在旧版本；
- 检查前端进入逻辑，发现内容来源是 HTTP `GET /api/document/:id` 或 `GET /api/share/:code`，即数据库；
- 检查 `joinDoc` 服务端实现，确认没有 `docState` 之类的状态下发事件。

**4. 错误原因分析**

系统存在两个内容真相源：数据库（落库内容）与房间内存（实时内容），进入时只读了前者。协同系统需要一个房间级状态（`roomState`）：`joinDoc` 时若房间已有状态则下发 `docState` 给新成员，若没有则以数据库内容初始化房间状态。当前版本未实现，属于已知限制（见 README）。

---

## Bug 7：快照接口 `req.user` 为 undefined

**1. 错误现象**

点击「保存快照」后前端提示失败，后端控制台报：

```
TypeError: Cannot read properties of undefined (reading 'userId')
    at exports.createSnapshot (...controller/snapshot.js:7:33)
```

**2. 错误描述**

快照路由挂载时写成了 `app.use('/api/snapshot', snapshotRouter)`，漏掉了 `authMiddleware`。

**3. 排错过程**

- 看堆栈定位到控制器第 7 行 `const userId = req.user.userId`；
- 反查 `middleware/auth.js`，确认它负责把 JWT 解析结果挂到 `req.user`；
- 对照 `app.js` 其他路由挂载方式：`folder`、`document` 都是 `app.use(路径, authMiddleware, 路由)`，只有 snapshot 少了一个参数。

**4. 错误原因分析**

Express 中间件是按挂载顺序串行执行的，未挂鉴权中间件时请求直接进路由，`req.user` 从未被赋值。这类问题不会在启动时报错，只在运行时第一次调用接口时暴露。修复为 `app.use('/api/snapshot', authMiddleware, snapshotRouter)`。

---

## Bug 8：模板调用 `parseExt` 未导入，整页退化为空白编辑器

**1. 错误现象**

打开任意文档，页面标题变成「未命名文档」，类型标签显示「纯文本」，编辑器只剩第 1 行空内容，顶栏在线列表也空了。控制台连续报错：

```
[Vue warn]: Property "parseExt" was accessed during render but is not defined on instance.
Editor.vue:30 Uncaught (in promise) TypeError: _ctx.parseExt is not a function
```

**2. 错误描述**

`Editor.vue` 的 `<script setup>` 里只写了 `import { resolveDocView } from '../utils/docType'`，模板里却在调 `parseExt(...)`。

**3. 排错过程**

- 先怀疑后端：用伪造 JWT（`{userId:2, username:'asdf'}` + 项目 secret）直接请求 `GET /api/document/12`，返回 HTTP 200，`name`、`doc_type` 均正确，排除接口与鉴权问题；
- 回看浏览器控制台，`TypeError: _ctx.parseExt is not a function` 指向渲染函数第 30 行；
- 检查 import 列表，确认真的是漏了 `parseExt`。

**4. 错误原因分析**

`<script setup>` 中未导入的标识符在模板里被当作 `_ctx.xxx` 去访问组件实例，实例上没有该属性，于是渲染函数直接抛异常。Vue 的渲染是整棵子树一起执行的，渲染函数抛错后整页渲染中断，表现出的现象是「所有绑定数据都消失」，很容易被误判成数据没加载到或接口 400。后续改为用 `computed` 包一层（`docExt`）避免在模板里直接调函数，同时补齐导入。

---

## Bug 9：提示条混进 `v-if` 链，校验失败时既不显示表格也不显示文本

**1. 错误现象**

往 `why.csv` 里粘一段不合法的 CSV，页面出现提示「无法以表格视图显示……当前按纯文本显示」，但提示下方并没有出现纯文本编辑器，整块渲染区是空的。

**2. 错误描述**

原本写成：

```vue
<div v-if="docView.view === 'table' && csvError" class="type-tip">...</div>
<CsvTable v-if="docView.view === 'table' && !csvError" />
<div v-else-if="docView.view === 'markdown' && mdMode === 'preview'" ...></div>
<MonacoEditor v-else />
```

**3. 排错过程**

- 现象是「提示条出来了，兜底编辑器没出来」，说明 `v-if / v-else-if / v-else` 这条链没有走到最后一项；
- 对照 Vue 的编译规则：`v-else-if` / `v-else` 必须紧跟在持有 `v-if` 的那个元素之后，中间插入任何元素都会断链；
- 检查发现 `CsvTable` 的 `v-if` 条件为假，但它是链头，链头为假后 `v-else / v-else-if` 应当生效才对——问题是提示条本身也带着 `v-if`，两个并列的 `v-if` 被编译器当成两条独立链，提示条的 `v-if` 把紧随其后的 `CsvTable` 抢成了自己的 `v-else` 分支；
- 改为：提示条独立 `v-if`，渲染链的链头挪到 `CsvTable`，`v-if="showGrid"`（表格类型 + 内容合法 + 本端选的是表格视图），Markdown 与 Monaco 依次 `v-else-if` / `v-else`。

**4. 错误原因分析**

`v-if` 链是**位置敏感**的结构：编译器按「相邻兄弟元素」判断谁与谁成链，一个仅有 `v-if` 的提示元素插在链头前面时，会把后面的元素吸附成自己的分支，从而改变整条链的语义。修复原则是：**提示类元素永远不参与渲染链**，要么放到链外独立 `v-if`，要么包进外层容器。

---

## Bug 10：CSV 行分隔符误用 `/`，整段内容被当成一行

**1. 错误现象**

粘进 `why.csv` 的内容是 `姓名,年龄,城市 / 张三,20,北京 / 李四,22,上海`，表格视图把表头渲染成 `姓名`、`年龄`、`城市`、`/`、`张三`、`20`、`北京`、`/`、`李四`、`22`、`上海` 共 7 列，只有 1 行数据。

**2. 错误描述**

用户把 `/` 当成换行符号书写示例数据，而 CSV 的行分隔符是 `\n`（或 `\r\n`），`/` 只是一个普通字符。

**3. 排错过程**

- 看截图里的表头：`城市` 后面紧跟一个单独的 `/` 单元格，说明解析器把 `/` 当成了列；
- 用 `papaparse` 单独解析该字符串，`data.length` 为 1，`data[0].length` 为 11，与页面表现一致；
- 改用真实换行写入后，`data.length = 3`，列数 3，渲染正常。

**4. 错误原因分析**

不是代码缺陷，是输入格式错误。CSV 的解析规则只认 `,`（或 `\t`、`|`）作字段分隔、`\n` 作记录分隔，校验逻辑本身没错。此处也顺带验证了校验器的价值：若没有「每行分隔符数量必须与首行一致」这条规则，这种单行多列的内容会被静默当成一张 1 行 11 列的宽表。

---

## Bug 11：`DrawLayer` 漏挂进模板，按钮有、画布无

**1. 错误现象**

点「批注」按钮后按钮变橙色、提示「已进入批注模式」，但鼠标在文档上划动没有任何线条出现。

**2. 错误描述**

`Editor.vue` / `Share.vue` 的 `<template>` 里补了批注按钮与画笔控件，但漏掉了 `<DrawLayer>` 组件本身，`annotation.js` 的 `attach(socket)` 其实已经正常收到了服务端的 `boardState`、`strokes` 里也有数据。

**3. 排错过程**

- Vue Devtools 里查组件树，`DrawLayer` 不存在，确认是模板没挂；
- 确认状态层无问题：`strokes` 数组长度随远端笔画增长，说明 socket 链路通了；
- 补挂组件后发现仍不显示，原因是没有相对定位容器——`DrawLayer` 的 `.draw-layer` 是 `position: absolute; inset: 0`，父元素若是 `static` 就会相对最近定位祖先（通常是视口）铺满整页，表现为「线条画在莫名位置」；
- 补 `<div class="editor-area">{ position: relative }</div>` 包裹渲染区后正常。

**4. 错误原因分析**

状态层（组合式函数）与视图层（组件、容器）是两套容易脱节的东西：逻辑写通了不等于看得见。绝对值定位的覆盖层必须同时满足两个条件——**组件被挂载** 和 **父级有定位上下文**，缺任意一个都不显示或错位。另一方面也说明批注按钮的 `v-if="docView.view !== 'table'"` 会让表格文档的批注入口整块消失，排查时先确认当前文档类型。

---

## Bug 12：分享页收到远端 op 时 `transform is not defined`

**1. 错误现象**

分享页本地有未确认操作（刚打完字、还没来得及收到 `opAck`）时，另一端也发来一次编辑，控制台报：

```
ReferenceError: transform is not defined
```

随后分享页内容停在旧值不再更新。

**2. 错误描述**

`Share.vue` 里只写了 `import { diffToOp, applyOp } from '../utils/ot'`，但 `remoteOp` 回调里对 `pendingOps` 逐条执行了 `transform(localOp, remoteOp)`。

**3. 排错过程**

- 报错堆栈指向 `remoteOp` 回调，确认函数体里确实调用了 `transform`；
- 检查 import 行，`transform` 不在导入列表里；
- 补齐导入后重测：两端并发输入，内容一致。

**4. 错误原因分析**

与 Bug 8 同源：`<script setup>` 的作用域是模块级，模板与事件回调里用到的任何外部函数都必须在导入列表中出现。此类问题的特点是**只在特定分支才触发**（本例只在「本地有未确认 op」且「同时收到远端 op」时才走到那行），静态检查和日常单端测试都发现不了，容易在演示现场才暴露。修复为 `import { diffToOp, applyOp, transform } from '../utils/ot'`。
