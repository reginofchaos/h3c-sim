/* 安全与可靠性：AAA / 用户 / SSH / 802.1X / 端口安全 / 攻击防范 / RADIUS */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  /* ============ 本地用户与 AAA ============ */
  R({
    views: ['system'], pat: 'local-user <word> class manage', seq: 'aaa',
    help: '创建管理类本地用户并进入用户视图',
    run: function (c) {
      var u = c.dev.cfg.users.filter(function (x) { return x.name === c.args._1; })[0];
      if (!u) { u = { name: c.args._1, role: 'network-operator', password: null, services: [], class: 'manage', state: 'active' }; c.dev.cfg.users.push(u); }
      return { enter: { view: 'local-user', arg: c.args._1 } };
    },
    undo: function (c) {
      c.dev.cfg.users = c.dev.cfg.users.filter(function (x) { return x.name !== c.args._1; });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'local-user <word>', hidden: true, seq: 'aaa',
    help: '创建本地用户',
    run: function (c) {
      var u = c.dev.cfg.users.filter(function (x) { return x.name === c.args.word; })[0];
      if (!u) { u = { name: c.args.word, role: 'network-operator', password: null, services: [], class: 'manage', state: 'active' }; c.dev.cfg.users.push(u); }
      return { enter: { view: 'local-user', arg: c.args.word } };
    }
  });
  R({
    views: ['local-user'], pat: 'password simple <text>', seq: 'aaa',
    help: '配置明文密码', run: function (c) { user(c).password = c.args.text; return { out: '' }; }
  });
  R({
    views: ['local-user'], pat: 'password hash <text>', hidden: true, seq: 'aaa',
    help: '配置密文密码', run: function (c) { user(c).password = c.args.text; user(c).hash = true; return { out: '' }; }
  });
  R({
    views: ['local-user'], pat: 'authorization-attribute user-role +network-admin|network-operator|level-0|level-15', seq: 'aaa',
    help: '配置用户角色/权限等级',
    run: function (c) {
      var r = c.args._0;
      user(c).role = r;
      if (/^level-/.test(r)) user(c).level = parseInt(r.replace('level-', ''), 10);
      return { out: '' };
    }
  });
  R({
    views: ['local-user'], pat: 'service-type +ssh|telnet|terminal|http|https|ftp|pad|lan-access', seq: 'aaa',
    help: '配置用户服务类型',
    run: function (c) { var u = user(c); if (u.services.indexOf(c.args._0) < 0) u.services.push(c.args._0); return { out: '' }; }
  });
  R({
    views: ['local-user'], pat: 'access-limit <int>', hidden: true, seq: 'aaa',
    help: '限制最大接入数', run: function (c) { user(c).accessLimit = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['local-user'], pat: 'idle-timeout <int>', hidden: true, seq: 'aaa',
    help: '配置闲置超时', run: function (c) { user(c).idle = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['local-user'], pat: 'bind-profile <word>', hidden: true, seq: 'aaa',
    help: '绑定授权策略', run: function () { return { out: '' }; }
  });
  function user(c) { return c.dev.cfg.users.filter(function (x) { return x.name === c.view.arg; })[0]; }

  R({
    views: ['system'], pat: 'aaa', hidden: true, seq: 'aaa',
    help: '进入 AAA 视图', run: function (c) { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'domain <word>', seq: 'aaa',
    help: '创建 ISP 域', run: function (c) { c.dev.cfg.domains = c.dev.cfg.domains || {}; c.dev.cfg.domains[c.args.word] = { auth: 'local', authz: 'none', acct: 'none' }; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'domain default enable <word>', hidden: true, seq: 'aaa',
    help: '配置默认域', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'authorization-attribute idle-cut <int>', hidden: true, seq: 'aaa',
    help: '配置闲置切断', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'password-control enable', seq: 'aaa',
    help: '开启密码管理功能', run: function (c) { c.dev.cfg.passwordControl = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'password-control length <int>', hidden: true, seq: 'aaa',
    help: '配置密码最小长度', run: function (c) { c.dev.cfg.passwordLength = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'password-control aging <int>', hidden: true, seq: 'aaa',
    help: '配置密码老化时间', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'password-control complexity', hidden: true, seq: 'aaa',
    help: '开启密码复杂度检查', run: function () { return { out: '' }; }
  });

  /* ============ 用户线（Console / VTY） ============ */
  R({
    views: ['system'], pat: 'user-interface vty <int>', seq: 'line',
    help: '进入单个 VTY 用户线视图',
    run: function (c) { return { enter: { view: 'line', arg: 'vty' + c.args.int } }; }
  });
  R({
    views: ['system'], pat: 'user-interface vty <int> <int>', seq: 'line',
    help: '进入 VTY 用户线范围视图（如 vty 0 4）',
    run: function (c) { return { enter: { view: 'line', arg: 'vty' + c.args._0 + '-' + c.args._1 } }; }
  });
  R({
    views: ['system'], pat: 'user-interface console <int>', seq: 'line',
    help: '进入 Console 用户线视图',
    run: function (c) { return { enter: { view: 'line', arg: 'con' + c.args.int } }; }
  });
  R({
    views: ['system'], pat: 'user-interface aux <int>', seq: 'line',
    help: '进入 AUX 用户线视图',
    run: function (c) { return { enter: { view: 'line', arg: 'aux' + c.args.int } }; }
  });

  /* 兼容经典 Comware 的 line 写法：Config.render 导出与真实设备备份均使用此格式 */
  R({
    views: ['system'], pat: 'line vty <int>', seq: 'line',
    help: '进入单个 VTY 用户线视图（经典写法）',
    run: function (c) { return { enter: { view: 'line', arg: 'vty' + c.args.int } }; }
  });
  R({
    views: ['system'], pat: 'line vty <int> <int>', seq: 'line',
    help: '进入 VTY 用户线范围视图（经典写法，如 line vty 0 4）',
    run: function (c) { return { enter: { view: 'line', arg: 'vty' + c.args._0 + '-' + c.args._1 } }; }
  });
  R({
    views: ['system'], pat: 'line con <int>', seq: 'line',
    help: '进入 Console 用户线视图（经典写法）',
    run: function (c) { return { enter: { view: 'line', arg: 'con' + c.args.int } }; }
  });
  R({
    views: ['system'], pat: 'line aux <int>', seq: 'line',
    help: '进入 AUX 用户线视图（经典写法）',
    run: function (c) { return { enter: { view: 'line', arg: 'aux' + c.args.int } }; }
  });
  R({
    views: ['line'], pat: 'acl <int> inbound', seq: 'line',
    help: 'VTY 入方向 ACL 过滤',
    run: function (c) { c.dev.cfg.vty.aclIn = c.args.int; return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'acl <int> outbound', hidden: true, seq: 'line',
    help: 'VTY 出方向 ACL 过滤',
    run: function (c) { c.dev.cfg.vty.aclOut = c.args.int; return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'authentication-mode +scheme|password|none', seq: 'line',
    help: '配置登录认证方式',
    run: function (c) {
      var a = c.args._0;
      if (/^vty/.test(c.view.arg)) c.dev.cfg.vty.auth = a; else c.dev.cfg.console.auth = a;
      return { out: '' };
    }
  });
  R({
    views: ['line'], pat: 'set authentication password simple <text>', seq: 'line',
    help: '配置登录密码（明文）',
    run: function (c) {
      if (/^vty/.test(c.view.arg)) c.dev.cfg.vty.password = c.args.text;
      else c.dev.cfg.console.password = c.args.text;
      return { out: '' };
    }
  });
  R({
    views: ['line'], pat: 'set authentication password cipher <text>', hidden: true, seq: 'line',
    help: '配置登录密码（密文）',
    run: function (c) {
      if (/^vty/.test(c.view.arg)) c.dev.cfg.vty.password = c.args.text; else c.dev.cfg.console.password = c.args.text;
      return { out: '' };
    }
  });
  R({
    views: ['line'], pat: 'user-role +network-admin|network-operator|level-15', seq: 'line',
    help: '配置用户线默认角色', run: function (c) { c.dev.cfg.vty.role = c.args._0; return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'protocol inbound +ssh|telnet|all', seq: 'line',
    help: '配置 VTY 支持的协议',
    run: function (c) {
      c.dev.cfg.vty.protocol = c.args._0;
      if (c.args._0 === 'telnet') { c.dev.cfg.telnet.enable = true; c.dev.cfg.ssh.enable = false; }
      if (c.args._0 === 'ssh') { c.dev.cfg.ssh.enable = true; }
      return { out: '' };
    }
  });
  R({
    views: ['line'], pat: 'idle-timeout <int>', seq: 'line',
    help: '配置超时时间（分钟）',
    run: function (c) { if (/^vty/.test(c.view.arg)) c.dev.cfg.vty.timeout = parseInt(c.args.int, 10); else c.dev.cfg.console.timeout = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'idle-timeout <int> <int>', hidden: true, seq: 'line',
    help: '配置超时时间（分 秒）', run: function (c) { c.dev.cfg.vty.timeout = parseInt(c.args._0, 10); return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'screen-length <int>', hidden: true, seq: 'line',
    help: '配置屏幕显示行数', run: function () { return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'history-command max-size <int>', hidden: true, seq: 'line',
    help: '配置历史命令缓冲大小', run: function () { return { out: '' }; }
  });
  R({
    views: ['line'], pat: 'speed <int>', hidden: true, seq: 'line',
    help: '配置 Console 口波特率', run: function (c) { c.dev.cfg.console.baud = parseInt(c.args.int, 10); return { out: '' }; }
  });

  /* ============ SSH / Telnet / HTTPS ============ */
  R({
    views: ['system'], pat: 'ssh server enable', seq: 'ssh',
    help: '开启 SSH 服务器', run: function (c) { c.dev.cfg.ssh.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.ssh.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ssh server port <int>', hidden: true, seq: 'ssh',
    help: '配置 SSH 端口', run: function (c) { c.dev.cfg.ssh.port = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'public-key local create rsa', seq: 'ssh',
    help: '生成本地 RSA 密钥对',
    run: function (c) { c.dev.cfg.ssh.rsaKey = true; return { out: 'Generating Keys...\n.\n.\nCreat the key pair successfully.' }; }
  });
  R({
    views: ['system'], pat: 'public-key local create dsa', hidden: true, seq: 'ssh',
    help: '生成本地 DSA 密钥对', run: function (c) { c.dev.cfg.ssh.dsaKey = true; return { out: 'Generating Keys...\nCreat the key pair successfully.' }; }
  });
  R({
    views: ['system'], pat: 'ssh user <word> service-type stelnet authentication-type +password|any', seq: 'ssh',
    help: '配置 SSH 用户服务类型', run: function (c) { c.dev.cfg.ssh.enable = true; c.dev.cfg.ssh.users = c.dev.cfg.ssh.users || {}; c.dev.cfg.ssh.users[c.args._0] = c.args._1; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'telnet server enable', seq: 'ssh',
    help: '开启 Telnet 服务器',
    run: function (c) { c.dev.cfg.telnet.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.telnet.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip http enable', seq: 'ssh',
    help: '开启 HTTP 服务', run: function (c) { c.dev.cfg.http.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.http.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip https enable', seq: 'ssh',
    help: '开启 HTTPS 服务', run: function (c) { c.dev.cfg.https.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.https.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ftp server enable', seq: 'ssh',
    help: '开启 FTP 服务', run: function (c) { c.dev.cfg.ftp.enable = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'sftp server enable', hidden: true, seq: 'ssh',
    help: '开启 SFTP 服务', run: function (c) { c.dev.cfg.sftp = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'netconf ssh server enable', hidden: true, seq: 'ssh',
    help: '开启 NETCONF over SSH', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'super password level <int> simple <text>', hidden: true, seq: 'aaa',
    help: '配置 super 密码', run: function (c) { c.dev.cfg.superPassword = c.args.text; return { out: '' }; }
  });

  /* ============ 802.1X ============ */
  R({
    views: ['system'], pat: 'dot1x', seq: 'dot1x',
    help: '全局开启 802.1X', run: function (c) { c.dev.cfg.dot1xGlobal = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.dot1xGlobal = false; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'dot1x', seq: 'dot1x',
    help: '端口开启 802.1X', run: function (c) { return C.applyIfaces(c, function (f) { f.dot1x.enable = true; c.dev.cfg.dot1xGlobal = true; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.dot1x.enable = false; }); }
  });
  R({
    views: ['interface'], pat: 'dot1x port-method +portbased|macbased', seq: 'dot1x',
    help: '配置 802.1X 接入控制方式',
    run: function (c) { return C.applyIfaces(c, function (f) { f.dot1x.method = c.args._0; }); }
  });
  R({
    views: ['interface'], pat: 'dot1x max-user <int>', hidden: true, seq: 'dot1x',
    help: '配置端口最大接入用户数', run: function (c) { return C.applyIfaces(c, function (f) { f.dot1x.maxUser = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'dot1x mandatory-domain <word>', hidden: true, seq: 'dot1x',
    help: '配置强制认证域', run: function (c) { return C.applyIfaces(c, function (f) { f.dot1x.domain = c.args.word; }); }
  });
  R({
    views: ['interface'], pat: 'dot1x re-authenticate', hidden: true, seq: 'dot1x',
    help: '开启定期重认证', run: function (c) { return C.applyIfaces(c, function (f) { f.dot1x.reauth = true; }); }
  });
  R({
    views: ['interface'], pat: 'mac-authentication', seq: 'dot1x',
    help: '开启 MAC 地址认证', run: function (c) { return C.applyIfaces(c, function (f) { f.macAuth = true; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.macAuth = false; }); }
  });
  R({
    views: ['system'], pat: 'mac-authentication', hidden: true, seq: 'dot1x',
    help: '全局开启 MAC 认证', run: function (c) { c.dev.cfg.macAuthGlobal = true; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'dot1x port-security', hidden: true, seq: 'dot1x',
    help: '开启端口安全', run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.enable = true; }); }
  });

  /* ============ 端口安全 ============ */
  R({
    views: ['interface'], pat: 'port-security enable', seq: 'portsec',
    help: '开启端口安全', run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.enable = true; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.enable = false; }); }
  });
  R({
    views: ['interface'], pat: 'port-security max-mac-count <int>', seq: 'portsec',
    help: '配置端口最大安全 MAC 数',
    run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.max = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'port-security port-mode +autolearn|secure|userlogin|mac-authentication', seq: 'portsec',
    help: '配置端口安全模式',
    run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.mode = c.args._0; }); }
  });
  R({
    views: ['interface'], pat: 'port-security intrusion-mode +blockmac|disableport|disableport-temporarily', seq: 'portsec',
    help: '配置入侵处理方式',
    run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.intrusion = c.args._0; }); }
  });
  R({
    views: ['interface'], pat: 'port-security mac-address sticky', seq: 'portsec',
    help: '开启 sticky MAC 功能',
    run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.sticky = true; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.sticky = false; }); }
  });
  R({
    views: ['interface'], pat: 'port-security timer autolearn aging <int>', hidden: true, seq: 'portsec',
    help: '配置安全 MAC 老化时间', run: function (c) { return C.applyIfaces(c, function (f) { f.portSecurity.aging = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'port-security ntk-mode', hidden: true, seq: 'portsec',
    help: '配置 Need To Know 模式', run: function () { return { out: '' }; }
  });

  /* ============ 攻击防范 ============ */
  var ATK = ['land', 'smurf', 'fraggle', 'winnuke', 'teardrop', 'ping-of-death', 'tcp-flag', 'icmp-redirect', 'icmp-unreachable', 'route-record', 'source-route', 'tracert', 'ip-fragment', 'udp-chargen'];
  ATK.forEach(function (k) {
    R({
      views: ['system'], pat: 'attack-defense ' + k + ' enable', hidden: true, seq: 'atk',
      help: '开启 ' + k + ' 攻击防范',
      run: function (c) { c.dev.cfg.security.attackProtection[k] = true; return { out: '' }; }
    });
  });
  R({
    views: ['system'], pat: 'attack-defense policy <word>', hidden: true, seq: 'atk',
    help: '创建攻击防范策略', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip source binding ip-address <ip> mac-address <word>', seq: 'atk',
    help: '配置 IP+MAC 静态绑定',
    run: function (c) {
      c.dev.cfg.ipSourceBind = c.dev.cfg.ipSourceBind || [];
      c.dev.cfg.ipSourceBind.push({ ip: c.args._0, mac: c.args._1 });
      return { out: '' };
    }
  });
  R({
    views: ['interface'], pat: 'ip verify source ip-address mac-address', seq: 'atk',
    help: '开启 IP Source Guard',
    run: function (c) { c.dev.cfg.security.ipSourceGuard = true; return C.applyIfaces(c, function (f) { f.ipSourceGuard = true; }); }
  });
  R({
    views: ['interface'], pat: 'ip source binding ip-address <ip> mac-address <word>', hidden: true, seq: 'atk',
    help: '接口下绑定', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'loopback-detection action +block|shutdown|no-learning', hidden: true, seq: 'atk',
    help: '配置环路检测动作', run: function (c) { c.dev.cfg.security.loopbackDetection.action = c.args._0; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'bpdu-drop', hidden: true, seq: 'atk',
    help: '丢弃 BPDU 报文', run: function (c) { return C.applyIfaces(c, function (f) { f.bpduDrop = true; }); }
  });
  R({
    views: ['system'], pat: 'cpu-defend policy <word>', hidden: true, seq: 'atk',
    help: '创建 CPU 防护策略', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'arp anti-attack entry-check fixed-mac enable', hidden: true, seq: 'atk',
    help: '开启 ARP 表项固化', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'arp anti-attack source-mac filter', hidden: true, seq: 'atk',
    help: '开启源 MAC 过滤', run: function () { return { out: '' }; }
  });

  /* ============ RADIUS / HWTACACS ============ */
  R({
    views: ['system'], pat: 'radius scheme <word>', seq: 'radius',
    help: '创建 RADIUS 方案并进入方案视图',
    run: function (c) {
      c.dev.cfg.radius.schemes[c.args.word] = { name: c.args.word, auth: null, acct: null, key: null, serverType: 'standard' };
      return { enter: { view: 'radius-scheme', arg: c.args.word } };
    }
  });
  R({
    views: ['radius-scheme'], pat: 'primary authentication <ip>', seq: 'radius',
    help: '配置主认证服务器', run: function (c) { rs(c).auth = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['radius-scheme'], pat: 'primary accounting <ip>', seq: 'radius',
    help: '配置主计费服务器', run: function (c) { rs(c).acct = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['radius-scheme'], pat: 'key authentication simple <text>', seq: 'radius',
    help: '配置认证共享密钥', run: function (c) { rs(c).key = c.args.text; return { out: '' }; }
  });
  R({
    views: ['radius-scheme'], pat: 'key accounting simple <text>', hidden: true, seq: 'radius',
    help: '配置计费共享密钥', run: function (c) { rs(c).acctKey = c.args.text; return { out: '' }; }
  });
  R({
    views: ['radius-scheme'], pat: 'server-type +standard|extended', hidden: true, seq: 'radius',
    help: '配置服务器类型', run: function (c) { rs(c).serverType = c.args._0; return { out: '' }; }
  });
  function rs(c) { return c.dev.cfg.radius.schemes[c.view.arg]; }
  R({
    views: ['system'], pat: 'hwtacacs scheme <word>', hidden: true, seq: 'radius',
    help: '创建 HWTACACS 方案',
    run: function (c) { c.dev.cfg.hwtacacs.schemes[c.args.word] = { name: c.args.word }; return { out: '' }; }
  });

  /* ============ 可靠性 ============ */
  R({
    views: ['system'], pat: 'bfd echo-source-ip <ip>', hidden: true, seq: 'reliab',
    help: '配置 BFD 回声源地址', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'bfd min-echo-receive-interval <int>', hidden: true, seq: 'reliab',
    help: '配置 BFD 参数', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'smart-link group <int>', hidden: true, seq: 'reliab',
    help: '创建 Smart Link 组', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'monitor-link group <int>', hidden: true, seq: 'reliab',
    help: '创建 Monitor Link 组', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'rrpp domain <int>', hidden: true, seq: 'reliab',
    help: '创建 RRPP 域', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'dl dp', hidden: true, seq: 'reliab',
    help: '开启 DLDP', run: function () { return { out: '' }; }
  });

})(window.H3C);
