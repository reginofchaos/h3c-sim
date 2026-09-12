# H3C 网络仿真实验室 · H3C Network Simulation Lab

[中文](#中文) | [English](#english)

---

<a id="中文"></a>
## 中文

> 《计算机网络设备配置》课程配套教学工具 —— 纯前端、零依赖的 H3C（Comware）风格交换机 / 路由器仿真终端。

[![当前版本](https://img.shields.io/badge/version-1.7.7-blue)](CHANGELOG.md)
[![许可](https://img.shields.io/badge/license-教学用途-green)](LICENSE)

### 简介

H3C 网络仿真实验室是一个**纯前端、无构建步骤**的网络设备配置仿真环境，模仿 H3C Comware V7 的命令行风格，可用于课堂实验、课后练习与演示。打开网页即可使用，所有数据保存在浏览器本地（localStorage），无需服务器。

### 功能特性

- **命令行终端**：视图体系（用户 / 系统 / 接口 / 协议视图）、`?` 帮助、`Tab` 补全、`↑/↓` 历史、`undo` 回退。
- **命令覆盖**：基础管理、二层（VLAN / STP / 链路聚合 / 端口镜像）、三层、静态 / RIP / OSPF / BGP 路由、ACL、QoS、安全（AAA / SSH / Telnet / 802.1X）、网络管理（SNMP / NTP / 日志）与监控（`display` 系列）。
- **真实转发仿真**：L2/L3 转发、STP 阻塞、ping / tracert 全网端到端验证（含 IPv4 与 IPv6 双栈）。
- **高级模块**：广域网 PPP/HDLC 接入、NAT（地址池 / NAPT / 静态 / 内部服务器）、VRRP 网关冗余、IS-IS 路由 + Route-Policy、IPv6 双栈。
- **拓扑编辑**：拖拽添加设备、端口到端口连线、链路状态指示、设备删除 / 重置。
- **工程与配置存取**：保存/读取（localStorage）、导出/打开工程文件（`.json`）、导出/导入设备配置（`.cfg`）。
- **实验场景**：内置多套实验教学场景，含实验目标 / 步骤 / 预期结果。
- **选中高亮增强**：选中设备的描边加粗至 3.5px、填充提亮并叠加青色发光（drop-shadow），在深色画布上一眼可辨（此前仅 2.5px 细描边，几乎看不出）。
- **悬浮交互**：PC / 服务器悬浮窗显示 MAC 地址；端口连线中点空白即取消；设备库悬浮显示设备简介与常用使用场景。

### 快速开始

直接用浏览器打开 `index.html` 即可；或将其作为静态站点部署（任意静态托管均可）。

### 版本与更新日志

迭代版本号自 **1.0.0** 起，按日汇总版本跨度，回滚的修改不记录。完整历史见 [CHANGELOG.md](CHANGELOG.md)。

| 版本 | 日期 | 要点 |
| --- | --- | --- |
| 1.7.7 | 2026-09-12 | 选中高亮增强 + 设备库悬浮窗补充简介与使用场景 |
| 1.7.6 | 2026-09-11 | 悬浮交互增强：PC 显示 MAC / 点击空白取消连线 / 设备库悬浮详情 |
| 1.7.5 | 2026-09-11 | PC 状态面板显示 MAC 地址（与转发实际 MAC 一致） |
| 1.7.4 | 2026-09-11 | 新增 display vlan brief，修正 MAC/ARP 表学习、修复三层交换机 VLANIF 恒 down |
| 1.7.3 | 2026-09-11 | 拖拽添加设备落在鼠标指示位置（与点击竖列排布区分） |
| 1.7.2 | 2026-09-11 | 新建设备改为左对齐竖列排布 |
| 1.7.1 | 2026-09-10 | 新设备自动避让空白区 + 自动平移画布使其可见 |
| 1.7.0 | 2026-09-10 | 拓扑交互增强：数量徽标 / 平行连线 / 虚线跟随 / 悬浮小窗 |
| 1.6.1 | 2026-09-09 | 逐字输出逐行占位 + 长输出不再秒出 |
| 1.6.0 | 2026-09-09 | PC 持续 ping（ping -t）+ 逐字输出节奏调优 |
| 1.5.0 | 2026-09-09 | 终端逐字逐行输出（贴近真实设备回显） |
| 1.4.1 | 2026-09-03 | ping/tracert 去歧义 + 关于面板收尾 |
| 1.4.0 | 2026-09-03 | 关于面板 + 迭代版本管理 + GitHub 发布 |
| 1.3.0 | 2026-09-03 | 自查修复 tracert 逐跳显示 |
| 1.2.0 | 2026-09-02 | IS-IS 路由 + Route-Policy |
| 1.1.0 | 2026-09-01 | 广域网 / NAT / VRRP / IPv6 四大模块 |
| 1.0.0 | 2026-08-31 | 项目立项 / 核心首发 |

### 作者与联系

- 作者：烧坏的内存条
- 邮箱：zyztonorrow@qq.com
- GitHub：<https://github.com/reginofchaos/h3c-sim>

### 许可

教学用途 · 自由用于课堂实验。

---

<a id="english"></a>
## English

> A teaching tool for the *Computer Network Device Configuration* course — a pure-frontend, zero-dependency H3C (Comware) style switch / router simulation terminal.

[![Version](https://img.shields.io/badge/version-1.7.7-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Educational-green)](LICENSE)

### Introduction

H3C Network Simulation Lab is a **pure-frontend, build-free** network device configuration simulation environment that mimics the H3C Comware V7 command-line style. It is suitable for in-class labs, after-class practice, and demonstrations. Just open the page in a browser — all data is stored locally in the browser (localStorage), and no server is required.

### Features

- **Command-line terminal**: view system (user / system / interface / protocol views), `?` help, `Tab` completion, `↑/↓` history, `undo` rollback.
- **Command coverage**: basic management, Layer 2 (VLAN / STP / link aggregation / port mirroring), Layer 3, static / RIP / OSPF / BGP routing, ACL, QoS, security (AAA / SSH / Telnet / 802.1X), network management (SNMP / NTP / logging), and monitoring (`display` family).
- **Realistic forwarding simulation**: L2/L3 forwarding, STP blocking, end-to-end ping / tracert verification across the whole network (IPv4 and IPv6 dual-stack).
- **Table learning visualization**: switch MAC table (source MAC recorded on the **ingress port**), ARP table (maintained only by **routers / PCs / switches with L3 interfaces such as VLANIF**), and `display vlan brief` (alias `dis vlan bri`) to see all VLANs and member ports at a glance. PC / server status panel shows the real MAC, identical to the one used in forwarding.
- **Advanced modules**: WAN PPP/HDLC access, NAT (address pool / NAPT / static / inside server), VRRP gateway redundancy, IS-IS routing + Route-Policy, IPv6 dual-stack.
- **Topology editor**: drag-and-drop devices, port-to-port links, link status indicators, device deletion / reset.
- **Project & config storage**: save/load (localStorage), export/open project files (`.json`), export/import device config (`.cfg`).
- **Lab scenarios**: several built-in teaching scenarios with objectives / steps / expected results.
- **Selection highlight**: selected device gets a bolder 3.5px stroke, brighter fill and a cyan glow — clearly visible on the dark canvas.
- **Hover interactions**: PC / server hover tip shows the MAC; clicking blank cancels a link; palette hover shows device intro and common use cases.

### Quick Start

Simply open `index.html` in a browser, or deploy it as a static site (any static host works).

### Versions & Changelog

Iterative versioning starts at **1.0.0**, summarized per day; rolled-back changes are not recorded. Full history: [CHANGELOG.md](CHANGELOG.md).

| Version | Date | Highlights |
| --- | --- | --- |
| 1.7.7 | 2026-09-12 | Selection highlight + palette tooltip adds intro & use cases |
| 1.7.6 | 2026-09-11 | Hover UX: PC shows MAC / click blank cancels link / palette shows device details |
| 1.7.5 | 2026-09-11 | PC status panel shows MAC address (consistent with forwarding MAC) |
| 1.7.4 | 2026-09-11 | Add `display vlan brief`; fix MAC/ARP table learning; fix L3 switch VLANIF always down |
| 1.7.3 | 2026-09-11 | Drag-drop device lands at cursor (distinct from click column layout) |
| 1.7.2 | 2026-09-11 | New devices placed in left-aligned vertical column |
| 1.7.1 | 2026-09-10 | New devices auto-avoid overlap + auto pan canvas into view |
| 1.7.0 | 2026-09-10 | Topology UX: count badge / parallel links / dashed follow / hover tip |
| 1.6.1 | 2026-09-09 | Per-line typewriter placeholder + long output no longer instant |
| 1.6.0 | 2026-09-09 | PC continuous ping (ping -t) + typewriter pacing tuning |
| 1.5.0 | 2026-09-09 | Terminal typewriter line-by-line output |
| 1.4.1 | 2026-09-03 | ping/tracert disambiguation + About panel cleanup |
| 1.4.0 | 2026-09-03 | About panel + iterative versioning + GitHub release |
| 1.3.0 | 2026-09-03 | Self-check fix: tracert hop-by-hop display |
| 1.2.0 | 2026-09-02 | IS-IS routing + Route-Policy |
| 1.1.0 | 2026-09-01 | WAN / NAT / VRRP / IPv6 four major modules |
| 1.0.0 | 2026-08-31 | Project kickoff / core first release |

### Author & Contact

- Author: 烧坏的内存条 (Burnt Memory Stick)
- Email: zyztonorrow@qq.com
- GitHub: <https://github.com/reginofchaos/h3c-sim>

### License

Educational use · Free for classroom experiments.
