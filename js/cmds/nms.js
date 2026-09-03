/* 网络管理与监控：SNMP / NTP / 日志 / IRF / 备份 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  /* ============ SNMP ============ */
  R({
    views: ['system'], pat: 'snmp-agent', seq: 'snmp',
    help: '开启 SNMP Agent', run: function (c) { c.dev.cfg.snmp.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.snmp.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent community read <word>', seq: 'snmp',
    help: '配置只读团体名', run: function (c) { c.dev.cfg.snmp.enable = true; c.dev.cfg.snmp.community.ro = c.args._0; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent community write <word>', seq: 'snmp',
    help: '配置读写团体名', run: function (c) { c.dev.cfg.snmp.enable = true; c.dev.cfg.snmp.community.rw = c.args._0; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent sys-info version +v1|v2c|v3|all', seq: 'snmp',
    help: '配置 SNMP 版本', run: function (c) { c.dev.cfg.snmp.version = c.args._0; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent sys-info location <text>', seq: 'snmp',
    help: '配置设备位置', run: function (c) { c.dev.cfg.snmp.location = c.args.text; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent sys-info contact <text>', seq: 'snmp',
    help: '配置联系人', run: function (c) { c.dev.cfg.snmp.contact = c.args.text; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent trap enable', seq: 'snmp',
    help: '开启 SNMP Trap', run: function (c) { c.dev.cfg.snmp.trapEnable = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent target-host trap address udp-domain <ip> params securityname <word>', seq: 'snmp',
    help: '配置 Trap 主机',
    run: function (c) { c.dev.cfg.snmp.trapHosts.push({ ip: c.args._0, sec: c.args._1 }); c.dev.cfg.snmp.trapEnable = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent target-host trap address udp-domain <ip> params securityname <word> v2c', hidden: true, seq: 'snmp',
    help: '配置 v2c Trap 主机', run: function (c) { c.dev.cfg.snmp.trapHosts.push({ ip: c.args._0, sec: c.args._1, ver: 'v2c' }); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent usm-user v3 <word> +authentication|privacy', hidden: true, seq: 'snmp',
    help: '配置 SNMPv3 用户', run: function (c) { c.dev.cfg.snmp.v3Users.push({ name: c.args._0, mode: c.args._1 }); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'snmp-agent log set', hidden: true, seq: 'snmp',
    help: '开启 SNMP 日志', run: function () { return { out: '' }; }
  });

  /* ============ NTP ============ */
  R({
    views: ['system'], pat: 'ntp-service enable', seq: 'ntp',
    help: '开启 NTP 服务', run: function (c) { c.dev.cfg.ntp.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.ntp.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ntp-service unicast-server <ip>', seq: 'ntp',
    help: '配置 NTP 服务器', run: function (c) { c.dev.cfg.ntp.enable = true; c.dev.cfg.ntp.servers.push(c.args.ip); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ntp-service unicast-peer <ip>', hidden: true, seq: 'ntp',
    help: '配置 NTP 对等体', run: function (c) { c.dev.cfg.ntp.servers.push(c.args.ip); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ntp-service refclock-master <int>', seq: 'ntp',
    help: '配置为 NTP 主时钟（层级）',
    run: function (c) { c.dev.cfg.ntp.master = true; c.dev.cfg.ntp.stratum = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ntp-service authentication enable', hidden: true, seq: 'ntp',
    help: '开启 NTP 认证', run: function (c) { c.dev.cfg.ntp.auth = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'clock timezone <word> add <num>', hidden: true, seq: 'ntp',
    help: '配置时区', run: function (c) { c.dev.cfg.timezone = c.args.word + '+' + c.args.num; return { out: '' }; }
  });

  /* ============ 信息中心 / 日志 ============ */
  R({
    views: ['system'], pat: 'info-center enable', seq: 'log',
    help: '开启信息中心', run: function (c) { c.dev.cfg.infoCenter = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center loghost <ip>', seq: 'log',
    help: '配置日志主机',
    run: function (c) { c.dev.cfg.syslog.enable = true; c.dev.cfg.syslog.hosts.push(c.args.ip); c.dev.cfg.infoCenter = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center loghost <ip> facility <word>', hidden: true, seq: 'log',
    help: '配置日志主机设施', run: function (c) { c.dev.cfg.syslog.hosts.push(c.args._1); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center logbuffer size <int>', seq: 'log',
    help: '配置日志缓冲区大小',
    run: function (c) { c.dev.cfg.syslog.logbuffer.size = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center logbuffer level <int>', hidden: true, seq: 'log',
    help: '配置日志缓冲区级别', run: function (c) { c.dev.cfg.syslog.logbuffer.level = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center source default channel logbuffer', hidden: true, seq: 'log',
    help: '配置日志输出规则', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center console channel console', hidden: true, seq: 'log',
    help: '配置控制台日志输出', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center synchronous', hidden: true, seq: 'log',
    help: '开启日志同步', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'info-center timestamp loghost format-date', hidden: true, seq: 'log',
    help: '配置日志时间戳格式', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'terminal logging level <int>', hidden: true, seq: 'log',
    help: '配置终端日志级别', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'undo info-center enable', hidden: true, seq: 'log',
    help: '关闭信息中心', run: function (c) { c.dev.cfg.infoCenter = false; return { out: '' }; }
  });

  /* ============ 流量统计 / sFlow / 镜像到远端 ============ */
  R({
    views: ['system'], pat: 'sflow agent ip <ip>', hidden: true, seq: 'nms',
    help: '配置 sFlow Agent 地址', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'sflow collector <int> ip <ip>', hidden: true, seq: 'nms',
    help: '配置 sFlow Collector', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'sflow enable', hidden: true, seq: 'nms',
    help: '端口开启 sFlow', run: function (c) { return C.applyIfaces(c, function (f) { f.sflow = true; }); }
  });
  R({
    views: ['system'], pat: 'ip netstream', hidden: true, seq: 'nms',
    help: '开启 NetStream', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ip netstream inbound', hidden: true, seq: 'nms',
    help: '开启接口入方向 NetStream', run: function (c) { return C.applyIfaces(c, function (f) { f.netstream = 'inbound'; }); }
  });
  R({
    views: ['interface'], pat: 'flow-interval <int>', hidden: true, seq: 'nms',
    help: '配置流量统计间隔', run: function (c) { return C.applyIfaces(c, function (f) { f.flowInterval = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['system'], pat: 'port-mirroring-group <int>', hidden: true, seq: 'nms',
    help: '创建流镜像组（部分版本）', run: function () { return { out: '' }; }
  });

  /* ============ IRF / 堆叠 ============ */
  R({
    views: ['system'], pat: 'irf domain <int>', seq: 'irf',
    help: '配置 IRF 域编号', run: function (c) { c.dev.cfg.irf.domain = parseInt(c.args.int, 10); c.dev.cfg.irf.enable = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'irf member <int> priority <int>', seq: 'irf',
    help: '配置 IRF 成员优先级',
    run: function (c) {
      c.dev.cfg.irf.enable = true; c.dev.cfg.irf.member = parseInt(c.args._0, 10); c.dev.cfg.irf.priority = parseInt(c.args._1, 10);
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'irf member <int> renumber <int>', hidden: true, seq: 'irf',
    help: '重新编号 IRF 成员', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'irf-port <int>', hidden: true, seq: 'irf',
    help: '进入 IRF 端口视图', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'irf-port-configuration active', hidden: true, seq: 'irf',
    help: '激活 IRF 端口配置', run: function () { return { out: 'The IRF port configuration has been activated. The device needs a reboot to form an IRF fabric.' }; }
  });
  R({
    views: ['system'], pat: 'stack enable', hidden: true, seq: 'irf',
    help: '开启堆叠', run: function (c) { c.dev.cfg.stack.enable = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stack role master', hidden: true, seq: 'irf',
    help: '配置堆叠角色', run: function (c) { c.dev.cfg.stack.role = 'master'; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stack priority <int>', hidden: true, seq: 'irf',
    help: '配置堆叠优先级', run: function (c) { c.dev.cfg.stack.priority = parseInt(c.args.int, 10); return { out: '' }; }
  });

  /* ============ 备份与升级 ============ */
  R({
    views: ['system'], pat: 'archive configuration location <word>', hidden: true, seq: 'nms',
    help: '配置配置归档路径', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'archive configuration interval <int>', hidden: true, seq: 'nms',
    help: '配置自动归档间隔', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'boot-loader file <word>', hidden: true, seq: 'nms',
    help: '指定启动文件', run: function () { return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'display startup', seq: 'nms', global: true,
    help: '显示下次启动文件',
    run: function (c) {
      return {
        out: 'MainBoard:\n  Current startup saved-configuration file: flash:/startup.cfg\n  Next main startup saved-configuration file: ' +
          (c.dev.cfg.startupCfg ? 'flash:/startup.cfg' : 'NULL') +
          '\n  Next backup startup saved-configuration file: NULL'
      };
    }
  });
  R({
    views: ['user'], pat: 'backup startup-configuration to <ip> <word>', hidden: true, seq: 'nms',
    help: '备份配置到服务器', run: function () { return { out: 'Backup finished successfully.' }; }
  });

})(window.H3C);
