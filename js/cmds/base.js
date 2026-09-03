/* 命令集公共基础：注册助手 + 视图导航 + 全局命令 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, E = H.Engine;

  function R(spec) { return E.register(spec); }
  H.R = R;

  /* 把用户输入解析为 cfg.ifaces 中的 key（简写名） */
  function resolveIface(dev, str) {
    if (!str) return null;
    var full = U.parseIf([str], dev);
    if (!full) {
      var two = U.parseIf(String(str).split(/\s+/), dev);
      if (!two) return null;
      full = two;
    }
    return U.ifShort(full);
  }
  /* 接口视图中的接口对象 */
  function viewIfaceName(c) { return c.view.arg; }
  function viewIface(c) { return c.dev.cfg.ifaces[c.view.arg]; }
  /* 确保接口存在，不存在则按类型创建 */
  function ensureIface(dev, shortName, kind) {
    if (!dev.cfg.ifaces[shortName]) {
      var f = H.Model.defaultIface({ name: shortName, type: 'GE' });
      f.mode = (kind === 'route') ? 'route' : 'bridge';
      if (kind === 'route') f.linkType = null;
      if (/^LoopBack/.test(shortName)) { f.mode = 'route'; dev.cfg.loopbacks[shortName] = f; }
      if (/^Vlan-interface/.test(shortName)) { f.mode = 'route'; dev.cfg.vlanIfaces[shortName] = f; }
      dev.cfg.ifaces[shortName] = f;
    }
    return dev.cfg.ifaces[shortName];
  }
  /* 进入接口视图（带存在性校验） */
  function enterIface(dev, shortName, kind) {
    var f = ensureIface(dev, shortName, kind);
    return { enter: { view: 'interface', arg: shortName } };
  }
  function isSwitch(c) { var t = c.dev.type; return t === 'switch'; }
  function isRouter(c) { var t = c.dev.type; return t === 'router' || t === 'firewall'; }
  function needL3(c) { return c.dev.l3 !== false; }

  function vlanEnsure(dev, vid) {
    if (!dev.cfg.vlans[vid]) {
      dev.cfg.vlans[vid] = {
        id: Number(vid),
        name: 'VLAN ' + ('0000' + vid).slice(-4),
        desc: '', created: true
      };
    }
    return dev.cfg.vlans[vid];
  }
  function vlanExists(dev, vid) { return !!dev.cfg.vlans[vid]; }

  /* 在接口视图中，对指定接口（或接口组）批量执行 fn */
  function eachIface(c, fn) {
    return fn(c.dev.cfg.ifaces[c.view.arg], c.view.arg, c.dev);
  }

  /* 输出辅助 */
  function ok() { return { out: '' }; }
  function msg(s) { return { out: s }; }

  H.Cmd = {
    resolveIface: resolveIface, viewIface: viewIface, viewIfaceName: viewIfaceName,
    ensureIface: ensureIface, enterIface: enterIface, vlanEnsure: vlanEnsure, vlanExists: vlanExists,
    isSwitch: isSwitch, isRouter: isRouter, needL3: needL3, eachIface: eachIface,
    ok: ok, msg: msg
  };

  /* ================= 视图导航 ================= */
  R({
    views: ['user'], pat: 'system-view',
    help: '进入系统视图', seq: 'base',
    run: function (c) { return { out: 'System View: return to User View with Ctrl+Z.', toSystem: true }; }
  });
  R({
    views: ['*'], pat: 'quit', global: true,
    help: '返回上一级视图', seq: 'base',
    run: function (c) {
      if (c.sess.stack.length <= 1) return { out: '' };
      return { exit: true };
    }
  });
  R({
    views: ['*'], pat: 'return', global: true,
    help: '返回用户视图', seq: 'base',
    run: function (c) { return { toUser: true }; }
  });
  R({
    views: ['*'], pat: 'end', global: true, hidden: true,
    help: '返回用户视图', run: function (c) { return { toUser: true }; }
  });
  R({
    views: ['*'], pat: 'exit', global: true, hidden: true,
    help: '退出', run: function (c) { return c.sess.stack.length > 1 ? { exit: true } : { out: '' }; }
  });
  R({
    views: ['*'], pat: '?', global: true, hidden: true,
    help: '帮助', run: function (c) { return { out: E.help(c.dev, c.sess, '') }; }
  });
  R({
    views: ['*'], pat: 'help', global: true, hidden: true,
    help: '显示帮助信息', run: function (c) { return { out: E.help(c.dev, c.sess, '') }; }
  });
  R({
    views: ['*'], pat: 'language-mode chinese', global: true, hidden: true,
    help: '切换中文提示', run: function () { return { out: '提示信息已切换为中文模式。' }; }
  });
  R({
    views: ['*'], pat: 'language-mode english', global: true, hidden: true,
    help: '切换英文提示', run: function () { return { out: '提示信息已切换为英文模式。' }; }
  });

  /* ================= 基础管理：设备名/横幅/时钟 ================= */
  R({
    views: ['user', 'system'], pat: 'sysname <name>',
    help: '配置设备名称', seq: 'base',
    run: function (c) {
      var old = c.dev.cfg.hostname;
      c.dev.cfg.sysname = c.args.name; c.dev.cfg.hostname = c.args.name;
      c.dev.name = c.dev.name === old ? c.args.name : c.dev.name;
      S.emit('device-name', c.dev);
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'header +login|shell|incoming <text>',
    help: '配置登录横幅信息', seq: 'base',
    run: function (c) { c.dev.cfg.banner = c.args.text.replace(/^#|#$/g, ''); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'header <text>', hidden: true, seq: 'base',
    help: '配置横幅', run: function (c) { c.dev.cfg.banner = c.args.text; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'banner motd <text>', hidden: true, seq: 'base',
    help: '配置 MOTD', run: function (c) { c.dev.cfg.motd = c.args.text; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'clock datetime <text>',
    help: '设置系统时间 (HH:MM:SS YYYY-MM-DD)', seq: 'base',
    run: function (c) { c.dev.cfg.clock = c.args.text; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'clock timezone <name> add <num>', seq: 'base',
    help: '设置时区', run: function (c) { c.dev.cfg.timezone = c.args.name + ' +' + c.args.num; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'clock protocol +ntp|none', hidden: true, seq: 'base',
    help: '时钟同步协议', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'domain name <word>', hidden: true,
    help: '配置默认域名', run: function (c) { c.dev.cfg.domain = c.args.word; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'domain <word>', hidden: true,
    help: '配置默认域名', run: function (c) { c.dev.cfg.domain = c.args.word; return { out: '' }; }
  });

  /* ================= 终端 / 用户视图工具 ================= */
  R({
    views: ['*'], pat: 'screen-length disable', global: true, seq: 'base',
    help: '关闭分屏显示',
    run: function (c) { c.dev.cfg.terminal.length = 0; return { out: 'Info: The screen length is disabled.' }; }
  });
  R({
    views: ['*'], pat: 'screen-length <int>', global: true, seq: 'base',
    help: '设置每屏显示行数',
    run: function (c) { c.dev.cfg.terminal.length = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['*'], pat: 'terminal monitor', global: true, seq: 'base',
    help: '打开终端信息显示开关',
    run: function (c) { c.dev.cfg.terminal.monitor = true; return { out: 'Info: Current terminal monitor is on.' }; }
  });
  R({
    views: ['*'], pat: 'terminal debugging', global: true, seq: 'base',
    help: '打开调试信息显示开关',
    run: function (c) { c.dev.cfg.terminal.debugging = true; return { out: 'Info: Current terminal debugging is on.' }; }
  });
  R({
    views: ['*'], pat: 'terminal trapping', global: true, seq: 'base',
    help: '打开 Trap 信息显示开关',
    run: function (c) { c.dev.cfg.terminal.trapping = true; return { out: '' }; }
  });
  R({
    views: ['*'], pat: 'terminal logging level <int>', global: true, hidden: true,
    help: '设置终端日志级别', run: function (c) { return { out: '' }; }
  });
  R({
    views: ['user', 'system'], pat: 'super', seq: 'base',
    help: '切换到用户级别 3', run: function (c) { return { out: 'User privilege level is 3, and super user password is not required.' }; }
  });
  R({
    views: ['user', 'system'], pat: 'super password <word>', hidden: true,
    help: '配置 super 密码', run: function (c) { c.dev.cfg.superPassword = c.args.word; return { out: '' }; }
  });

  /* ================= 文件与配置管理 ================= */
  R({
    views: ['user', 'system'], pat: 'save', seq: 'base',
    help: '保存当前配置',
    run: function (c) {
      c.dev.cfg.startupCfg = H.Config ? H.Config.render(c.dev) : JSON.stringify(c.dev.cfg);
      c.dev.rt.saved = true;
      S.saveLocal();
      return {
        out: [
          'The current configuration will be written to the device. Are you sure? [Y/N]:y',
          'Please input the file name(*.cfg)[flash:/startup.cfg]',
          '(To leave the existing filename unchanged, press the enter key):',
          'Validating file. Please wait...',
          'Saved the current configuration to mainboard device successfully.'
        ].join('\n')
      };
    }
  });
  R({
    views: ['user', 'system'], pat: 'save <word>', hidden: true, seq: 'base',
    help: '保存配置到指定文件',
    run: function (c) {
      c.dev.cfg.startupCfg = H.Config.render(c.dev);
      S.saveLocal();
      return { out: 'Saved the current configuration to mainboard device successfully.' };
    }
  });
  R({
    views: ['user'], pat: 'reset saved-configuration', seq: 'base',
    help: '清除下次启动配置文件',
    run: function (c) {
      c.dev.cfg.startupCfg = null; c.dev.rt.saved = false;
      return { out: 'The saved configuration file will be erased. Are you sure? [Y/N]:y\nConfiguration file in flash is being cleared...\nPlease wait ...\nConfiguration file is cleared.' };
    }
  });
  R({
    views: ['user'], pat: 'reboot', seq: 'base',
    help: '重启设备',
    run: function (c) {
      c.dev.rt.bootTs = Date.now();
      c.dev.rt.mac = {}; c.dev.rt.arp = {}; c.dev.rt.nd6 = {}; c.dev.rt.logs = [];
      S.emit('device-reboot', c.dev);
      return { out: 'Start to check configuration with next startup configuration file, please wait.........DONE!\nThis command will reboot the device. Continue? [Y/N]:y\nNow rebooting, please wait...' };
    }
  });
  R({
    views: ['user', 'system'], pat: 'startup saved-configuration <word>', hidden: true, seq: 'base',
    help: '指定下次启动配置文件', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'dir', seq: 'base',
    help: '显示文件系统目录',
    run: function (c) {
      var rows = [
        ['0', '-rw-', '1234', 'Jan 01 2026 00:00:00', 'startup.cfg'],
        ['1', '-rw-', '5678901', 'Jan 01 2026 00:00:00', 'system.ipe'],
        ['2', '-rw-', '65536', 'Jan 01 2026 00:00:00', 'logfile.log']
      ];
      return {
        out: 'Directory of flash: (VFAT)\n' + U.table(['Idx', 'Attr', 'Size(Byte)', 'Date', 'File Name'], rows) +
          '\n1,024,000 KB total (900,000 KB free)'
      };
    }
  });
  R({
    views: ['user'], pat: 'pwd', seq: 'base', help: '显示当前目录', run: function () { return { out: 'flash:' }; }
  });
  R({
    views: ['user'], pat: 'cd <word>', seq: 'base', help: '切换目录', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'more <word>', seq: 'base', help: '显示文件内容',
    run: function (c) { return { out: H.Config ? H.Config.render(c.dev) : '' }; }
  });
  R({
    views: ['user'], pat: 'delete <word>', seq: 'base', help: '删除文件',
    run: function () { return { out: 'Delete flash:/xxx.cfg?[Y/N]:y\n%Delete file flash:/xxx.cfg...Done.' }; }
  });
  R({
    views: ['user'], pat: 'ftp <ip>', seq: 'base', help: '登录 FTP 服务器',
    run: function (c) { return { out: 'Trying ' + c.args.ip + ' ...\nPress CTRL+C to abort.\nConnected to ' + c.args.ip + '.\n220 FTP service ready.\nUser(' + c.args.ip + ':(none)):' }; }
  });
  R({
    views: ['user'], pat: 'tftp <ip> put <word>', seq: 'base', help: 'TFTP 上传文件',
    run: function (c) { return { out: 'File will be transferred in binary mode.\nSending file to remote tftp server. Please wait... |\nTFTP: 100%...\nWrite file to remote tftp server successfully.' }; }
  });
  R({
    views: ['user'], pat: 'tftp <ip> get <word>', seq: 'base', help: 'TFTP 下载文件',
    run: function (c) { return { out: 'File will be transferred in binary mode.\nDownloading file from remote tftp server, please wait....\nTFTP: 100%...\nReceived 1024 bytes.\nFile downloaded successfully.' }; }
  });

  /* ================= 配置回滚 / 快捷键 ================= */
  R({
    views: ['system'], pat: 'configuration replace file <word>', hidden: true, seq: 'base',
    help: '配置回滚', run: function () { return { out: 'Configuration is replaced successfully.' }; }
  });
  R({
    views: ['system'], pat: 'archive configuration', hidden: true, seq: 'base',
    help: '开启配置归档', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'display history-command', seq: 'base', help: '显示历史命令',
    run: function (c) {
      return { out: (c.sess.history || []).map(function (h, i) { return '  ' + (i + 1) + '  ' + h; }).join('\n') || '  No history command.' };
    }
  });
  R({
    views: ['*'], pat: 'display current-configuration', global: true, seq: 'base',
    help: '显示当前生效配置',
    run: function (c) { return { out: H.Config.render(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display current-configuration interface <ifname>', global: true, seq: 'base',
    help: '显示指定接口的当前配置',
    run: function (c) {
      var short = resolveIface(c.dev, c.args.ifname);
      if (!short) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      var f = c.dev.cfg.ifaces[short];
      var o = [];
      H.Config.ifaceCfg(c.dev, short, f || H.Model.defaultIface({ name: short, type: 'GE' }), o);
      return { out: o.join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display saved-configuration', global: true, seq: 'base',
    help: '显示已保存配置',
    run: function (c) { return { out: c.dev.cfg.startupCfg || 'The specified configuration file does not exist.' }; }
  });
  R({
    views: ['*'], pat: 'display this', global: true, seq: 'base',
    help: '显示当前视图下的配置',
    run: function (c) { return { out: H.Config.renderView(c.dev, c.view) }; }
  });

  /* ================= 接口视图进入 ================= */
  R({
    views: ['system'], pat: 'interface <ifname>', seq: 'iface',
    help: '进入以太网/三层接口视图',
    run: function (c) {
      var n = U.ifShort(c.args.ifname);
      if (!c.dev.cfg.ifaces[n] && !/^(Vlan-interface|LoopBack|Bridge-Aggregation|Route-Aggregation|Tunnel)/.test(n)) {
        return { out: '                       ^\nError: Wrong parameter found at \'^\' position.', err: true };
      }
      return enterIface(c.dev, n, /^(Vlan-interface|LoopBack|Route-Aggregation|Tunnel)/.test(n) ? 'route' : 'bridge');
    }
  });
  R({
    views: ['system'], pat: 'interface <ifname> to <ifname>', hidden: true, seq: 'iface',
    help: '批量进入接口视图',
    run: function (c) {
      var a = U.ifShort(c.args.ifname);
      return enterIface(c.dev, a, 'bridge');
    }
  });
  R({
    views: ['system'], pat: 'interface vlan-interface <vid>', hidden: true, seq: 'iface',
    help: '进入 VLAN 接口视图',
    run: function (c) {
      vlanEnsure(c.dev, c.args.vid);
      return enterIface(c.dev, 'VLAN' + c.args.vid, 'route');
    }
  });
  R({
    views: ['system'], pat: 'interface bridge-aggregation <int>', hidden: true, seq: 'iface',
    help: '进入二三层聚合接口视图',
    run: function (c) {
      var id = c.args.int;
      if (!c.dev.cfg.lag[id]) c.dev.cfg.lag[id] = { id: Number(id), mode: 'static', type: 'bridge', members: [], adminUp: true };
      return enterIface(c.dev, 'BAGG' + id, c.dev.cfg.lag[id].type === 'route' ? 'route' : 'bridge');
    }
  });
  R({
    views: ['system'], pat: 'interface route-aggregation <int>', hidden: true, seq: 'iface',
    help: '进入三层聚合接口视图',
    run: function (c) {
      var id = c.args.int;
      if (!c.dev.cfg.lag[id]) c.dev.cfg.lag[id] = { id: Number(id), mode: 'static', type: 'route', members: [], adminUp: true };
      return enterIface(c.dev, 'RAGG' + id, 'route');
    }
  });
  R({
    views: ['system'], pat: 'interface loopback <int>', hidden: true, seq: 'iface',
    help: '进入 LoopBack 接口视图',
    run: function (c) { return enterIface(c.dev, 'Loop' + c.args.int, 'route'); }
  });
  R({
    views: ['system'], pat: 'interface loopback <int> to <int>', hidden: true, seq: 'iface',
    help: '批量创建 LoopBack 接口',
    run: function (c) { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'interface tunnel <int>', hidden: true, seq: 'iface',
    help: '进入 Tunnel 接口视图',
    run: function (c) { return enterIface(c.dev, 'Tun' + c.args.int, 'route'); }
  });
  R({
    views: ['system'], pat: 'interface range <text>', hidden: true, seq: 'iface',
    help: '批量配置接口范围 (如 1/0/1 to 1/0/10)',
    run: function (c) {
      var spec = c.args.text;
      var list = U.expandIfRange(c.dev, 'GE', spec) || U.expandIfRange(c.dev, '', spec);
      if (!list) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      c.sess.batchIfaces = list;
      return { out: 'Info: ' + list.length + ' interface(s) selected, commands will be applied to all of them.', refresh: false };
    }
  });

  /* 接口视图下的通用配置 */
  R({
    views: ['interface'], pat: 'description <text>',
    help: '配置接口描述', seq: 'iface',
    run: function (c) { H.Cmd.viewIface(c).desc = c.args.text; return { out: '' }; },
    undo: function (c) { H.Cmd.viewIface(c).desc = ''; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'shutdown',
    help: '关闭接口', seq: 'iface',
    run: function (c) {
      var f = H.Cmd.viewIface(c); f.adminUp = false;
      return { out: '' };
    },
    undo: function (c) { H.Cmd.viewIface(c).adminUp = true; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'undo shutdown', hidden: true, seq: 'iface',
    help: '打开接口', run: function (c) { H.Cmd.viewIface(c).adminUp = true; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'default', hidden: true, seq: 'iface',
    help: '恢复接口缺省配置',
    run: function (c) {
      var n = c.view.arg;
      var t = /^VLAN/.test(n) ? 'route' : /^Loop/.test(n) ? 'route' : 'bridge';
      c.dev.cfg.ifaces[n] = H.Model.defaultIface({ name: n, type: 'GE' });
      return { out: 'This command will restore the default settings. Continue? [Y/N]:y\nInterface ' + n + ' has been restored to the default configuration.' };
    }
  });
  R({
    views: ['interface'], pat: 'speed +10|100|1000|auto', seq: 'iface',
    help: '配置接口速率',
    run: function (c) { H.Cmd.viewIface(c).speed = c.args._1; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'duplex +auto|full|half', seq: 'iface',
    help: '配置接口双工模式',
    run: function (c) { H.Cmd.viewIface(c).duplex = c.args._1; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'mtu <int>', seq: 'iface',
    help: '配置接口 MTU',
    run: function (c) { H.Cmd.viewIface(c).mtu = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'flow-control', seq: 'iface',
    help: '开启流量控制', run: function (c) { H.Cmd.viewIface(c).flowControl = true; return { out: '' }; },
    undo: function (c) { H.Cmd.viewIface(c).flowControl = false; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'broadcast-suppression <num>', seq: 'iface',
    help: '配置广播风暴抑制（百分比）',
    run: function (c) {
      if (!c.dev.cfg.security.stormControl) c.dev.cfg.security.stormControl = {};
      H.Cmd.viewIface(c).stormBroadcast = parseFloat(c.args.num);
      return { out: '' };
    },
    undo: function (c) { H.Cmd.viewIface(c).stormBroadcast = null; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'broadcast-suppression pps <int>', hidden: true, seq: 'iface',
    help: '按 pps 抑制广播风暴', run: function (c) { H.Cmd.viewIface(c).stormBroadcast = c.args.int + 'pps'; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'multicast-suppression <num>', seq: 'iface',
    help: '组播风暴抑制', run: function (c) { H.Cmd.viewIface(c).stormMulticast = parseFloat(c.args.num); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'unicast-suppression <num>', seq: 'iface',
    help: '未知单播风暴抑制', run: function (c) { H.Cmd.viewIface(c).stormUnicast = parseFloat(c.args.num); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'loopback-detection enable', seq: 'iface',
    help: '开启环路检测',
    run: function (c) { H.Cmd.viewIface(c).loopbackDetect = true; c.dev.cfg.security.loopbackDetection.enable = true; return { out: '' }; },
    undo: function (c) { H.Cmd.viewIface(c).loopbackDetect = false; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'port link-mode route', seq: 'iface',
    help: '将接口切换为三层模式',
    run: function (c) {
      if (!c.dev.l3) return { out: 'Error: The device does not support Layer 3 interfaces.', err: true };
      var f = H.Cmd.viewIface(c); f.mode = 'route'; f.linkType = null; f.accessVlan = null; f.permitVlans = [];
      return { out: 'The configuration of the interface will be restored to the default. Continue? [Y/N]:y\nInfo: The interface mode has been changed to Layer 3 mode.' };
    }
  });
  R({
    views: ['interface'], pat: 'port link-mode bridge', seq: 'iface',
    help: '将接口切换为二层模式',
    run: function (c) {
      var f = H.Cmd.viewIface(c); f.mode = 'bridge'; f.linkType = 'access'; f.accessVlan = 1; f.permitVlans = [1]; f.ip = null;
      return { out: 'Info: The interface mode has been changed to Layer 2 mode.' };
    }
  });
  R({
    views: ['interface'], pat: 'combo enable +copper|fiber', hidden: true, seq: 'iface',
    help: '配置 Combo 口类型', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'port up-mode', hidden: true, seq: 'iface',
    help: '配置端口 up 模式', run: function () { return { out: '' }; }
  });

  /* 三层接口 IP */
  R({
    views: ['interface'], pat: 'ip address <ip> <mask>', seq: 'l3',
    help: '配置接口 IP 地址',
    run: function (c) {
      var f = H.Cmd.viewIface(c);
      if (f.mode !== 'route' && !/^(VLAN|Loop|RAGG|Tun)/.test(c.view.arg)) {
        f.mode = 'route';
      }
      var len = U.maskLen(c.args.mask);
      f.ip = { addr: c.args.ip, mask: /^\d+$/.test(String(c.args.mask)) ? U.lenMask(len) : c.args.mask };
      if (c.dev.type === 'pc' || c.dev.type === 'server') {
        S.emit('change');
      }
      return { out: '' };
    },
    undo: function (c) { var f = H.Cmd.viewIface(c); f.ip = null; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ip address <ip> <mask> sub', seq: 'l3',
    help: '配置从 IP 地址',
    run: function (c) {
      var f = H.Cmd.viewIface(c);
      var len = U.maskLen(c.args.mask);
      f.ipSecondary.push({ addr: c.args.ip, mask: /^\d+$/.test(String(c.args.mask)) ? U.lenMask(len) : c.args.mask });
      return { out: '' };
    }
  });
  R({
    views: ['interface'], pat: 'ip address dhcp-alloc', seq: 'l3',
    help: '通过 DHCP 获取地址',
    run: function (c) {
      var f = H.Cmd.viewIface(c);
      var got = H.Sim && H.Sim.dhcpAllocate ? H.Sim.dhcpAllocate(c.dev, c.view.arg) : null;
      if (got) {
        f.ip = { addr: got.ip, mask: got.mask };
        if (got.gateway) c.dev.cfg.defaultRoute = got.gateway;
        return { out: 'Info: Obtained an IP address ' + got.ip + '/' + U.maskLen(got.mask) + ' from DHCP server.' };
      }
      return { out: 'DHCP: Failed to obtain an IP address. (No DHCP server or pool available)' };
    }
  });
  R({
    views: ['interface'], pat: 'ip address unnumbered interface <ifname>', hidden: true, seq: 'l3',
    help: '配置地址借用', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ip mtu <int>', hidden: true, seq: 'l3',
    help: '配置 IP MTU', run: function (c) { H.Cmd.viewIface(c).ipMtu = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'tcp mss <int>', hidden: true, seq: 'l3',
    help: '配置 TCP MSS', run: function () { return { out: '' }; }
  });

})(window.H3C);
