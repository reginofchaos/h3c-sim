# 更新日志 · H3C 网络仿真实验室

> 迭代版本号自 **1.0.0** 起，按日汇总版本跨度；回滚的修改不记录。

## [1.6.1] — 2026-09-09 · 逐字输出逐行占位 + 长输出不再秒出
- 修复「先留出整块空白再逐行显示」：打字机改为**一行一行 `appendChild` 新节点**，屏幕空间随输出逐行增长（此前一次性建好所有空行节点，空节点同样占高度，所以看起来是"先把位置占满"）
- 修复 `display interface` 等长输出**仍然是秒出**：原先超过 240 行会直接放弃动画，现放宽到 3000 行，并改为按总时长上限自动提速 —— 实测 `dis int`（673 行 / 2 万字符）约 5 秒滚动完
- 命令回显行立即完整出现，之后输出行才开始逐字揭示，回车后的观感更接近真实设备
- `ping -t` 的新行排入当前动画队列尾部，不再打断正在刷的那一行
- 回归测试 `verify.js` 达 **250** 项断言全通过

## [1.6.0] — 2026-09-09 · PC 持续 ping（ping -t）+ 逐字输出节奏调优
- **PC / 服务器终端新增 `ping -t`**：持续探测目标，每 1 秒输出一行，`Ctrl+C` 中断并给出收发统计（已发送 / 已接收 / 丢失率 / 往返 min-avg-max）
- **持续 ping 实时响应拓扑变化**：每次探测都重新走转发路径计算 —— 链路断开或交换机端口 `shutdown` 立即变为 `Request time out`，恢复后自动回到 `Reply`（适合课堂上"一边 ping 一边改配置"的演示）
- 修复端口 down 时提示 `Ping: The source address does not exist.` 的误导：仍取网卡已配置的 IP，正确显示为 `Request time out`
- PC `ping` 同时支持 `-n <次数>`；`ping -t` 运行期间输入框只读，只能 `Ctrl+C` 中断（贴近真实终端行为）
- **逐字输出节奏调慢**：380 字符/秒、行间停顿 30ms、单次总时长上限 5 秒（原 900/12ms/2.6s），回显更接近真实设备
- 排查并确认所有有输出的路径（命令执行 / Tab 候选 / `?` 帮助 / `printOut` / 首屏横幅 / 持续任务）均已接入逐字揭示
- 新增 `Sim.pingOnce` / `Sim.pingStats`，终端新增 `startJob` / `stopJob` 后台任务调度
- 回归测试 `verify.js` 达 **247** 项断言全通过

## [1.5.0] — 2026-09-09 · 终端逐字逐行输出（贴近真实设备回显）
- 终端屏幕改为「一行一节点」渲染：命令回显与输出按 `\n` 拆成 `.t-line`，为逐字揭示提供基础
- 新增打字机效果：执行 `display` / `ping` 等命令后，输出像真实设备一样**逐字逐行刷出**，行末带轻微停顿
- 输出过程中末行显示闪烁方块光标；**按任意键 / 回车 / 空格 / 点击屏幕**可立即跳到完整内容（回车只快进，不会误提交命令）
- 单次输出总时长上限约 2.6 秒，长输出自动提速；超过 240 行（如 `display current-configuration`）自动关闭动画避免卡顿
- 动画只作用于显示层：命令结果仍**立即完整写入会话 buffer**，历史回放与自动化测试不受影响
- 新增 `H.UI.Terminal.setTyping()` 开关，自动化回归可关闭动画
- 回归测试 `verify.js` 达 **226** 项断言全通过

## [1.4.1] — 2026-09-03 · ping/tracert 命令去歧义 + 关于面板收尾
- 修复 `ping <ip>` 与 `ping <word>` 在系统视图同时匹配导致的 `Error: Ambiguous command`（输入 IPv4 地址时报错）；`tracert` 同步修复
- engine 新增 `<host>` token（接受 IPv4 或主机名格式，字母开头 + 字母数字/连字符/点），统一覆盖「ping 主机名」与「ping IP」两种场景
- `Sim.ping` / `Sim.tracert` 已支持按设备主机名解析，无需两条命令并行
- 关于面板移除「当前版本」行后清理两个死变量（`ver` / `updated`）
- 新增 `.gitattributes`（`* text=auto eol=lf`），全仓统一 LF，根治 Contents API 同步把 CRLF 推上去的问题
- 回归测试 `verify.js` 达 **210** 项断言全通过

## [1.4.0] — 2026-09-03 · 关于面板 + 迭代版本管理 + GitHub 发布
- 新增「关于」按钮（位于帮助按钮旁）：展示作者、联系方式、GitHub 仓库地址、当前版本号与更新日志
- 建立迭代版本号管理机制（自 1.0.0 起，按日汇总版本跨度，回滚修改不记录）
- 新增 `version.json` / `js/core/version.js`（运行时版本数据源）/ `CHANGELOG.md`（GitHub 展示）
- 初始化 Git 仓库并发布至 GitHub（reginofchaos/h3c-sim），建立 Release 与版本标签
- 约定：以后每次更新自动更新版本号与更新记录，并同步 GitHub

## [1.3.0] — 2026-09-03 · 自查修复：tracert 逐跳显示
- 修复 `tracert` / `tracert6` 只显示目的地、不逐跳展开的问题（现正确逐跳展开中间路由器）
- IPv6 双栈模块全覆盖自检，无新增缺陷
- 回归测试 `verify.js` 达 **180** 项断言全通过

## [1.2.0] — 2026-09-02 · IS-IS 路由进程 + Route-Policy
- IS-IS 路由进程（is-level / network-entity / import-route），接口 isis enable / cost / circuit-level / circuit-type
- Route-Policy 多节点（if-match acl|ip-prefix、apply cost|preference|tag|next-hop）真实过滤与改写路由属性
- 新增场景 6：IS-IS + Route-Policy 实验
- 修复 display isis peer 主机名显示、undo route-policy 节点删除失败
- 回归测试 `verify.js` 达 **142** 项断言全通过

## [1.1.0] — 2026-09-01 · 广域网 / NAT / VRRP / IPv6 四大模块 + 体验修复
- 广域网接入模块(WAN)：Serial 口 PPP/HDLC 封装、PAP/CHAP 认证与状态机
- NAT 地址转换：地址池 / NAPT / 静态 NAT / 内部服务器(DNAT) + 真实转发与会话表
- VRRP 网关冗余：主备选举、虚拟网关、故障切换与抢占
- IPv6 双栈端到端转发：ipv6 地址 / 静态路由、forwardPath6、真实 ping6 / tracert6、display ipv6 *
- 拓扑 UI 优化：设备动态宽度、链路标签浮层、面板重显按钮、右侧设备详情
- 保存/导出三重兜底（File System Access API / msSaveOrOpenBlob / 手动复制弹窗）
- 4 个场景增加「实验目标 / 步骤 / 预期」
- CLI 修复：help 列表显示完整子句、dis cu 展示已连默认端口、接口名四种写法统一解析
- 修复 IF_ABBR 与 Serial 端口名冲突、undo route-policy 死命令等
- 回归测试 `verify.js` 由 73 项提升至 **172** 项全通过

## [1.0.0] — 2026-08-31 · 项目立项 / 核心首发
- 纯前端 H3C Comware 风格交换机 / 路由器仿真终端（无框架、无构建步骤、原生 JS）
- 核心转发引擎：L2/L3 转发、STP、ping / tracert 全网仿真
- CLI 引擎：视图体系、? 帮助、Tab 补全、历史、undo
- 命令模块：基础管理 / 二层(VLAN/STP/聚合/镜像) / 三层 / 静态·RIP·OSPF·BGP 路由 / ACL / QoS / 安全(AAA/SSH/Telnet/802.1X) / 网络管理(SNMP/NTP/日志) / 监控(display 系列)
- 拓扑编辑器：拖拽添加、端口到端口连线、链路状态指示、设备删除 / 重置
- 工程存取：保存/读取(localStorage)、保存/打开工程文件(.json)、导出/导入 .cfg 配置
- PC / Server 主机 CLI（ipconfig / ping / tracert / set ip 等）
- 4 个实验教学场景
- 回归测试脚本 `verify.js`（73 项断言）
- 修复 monitor.js 语法错误、state.js 导出漏字段、sim.js 数据指向错误、loadScenario 连线索引错位、sysname 视图受限、新建设备默认 hostname 等

> 注：2026-08-31 当日曾对拓扑 UI 做一轮优化后又整体回滚，按「回滚的修改不记录」约定未列入本日志。
