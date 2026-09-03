/* NAT 地址转换：easy-ip / 地址池 NAPT / 静态 NAT / 内部服务器映射（nat server）
 * 真实转发在 sim.js 中接入：出接口 SNAT（记录会话）、入接口 DNAT 反向。 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  function f(c) { return c.dev.cfg.ifaces[c.view.arg]; }
  function ensureGroups(dev) { if (!dev.cfg.natGroups) dev.cfg.natGroups = {}; return dev.cfg.natGroups; }
  function ensureStatic(dev) { if (!dev.cfg.natStatic) dev.cfg.natStatic = []; return dev.cfg.natStatic; }

  /* ---------- 系统视图：地址池 / 静态 NAT ---------- */
  R({
    views: ['system'], pat: 'nat address-group <int> <ip> <ip>', seq: 'nat',
    help: '配置 NAT 地址池（起始 IP 结束 IP）',
    run: function (c) {
      var g = ensureGroups(c.dev);
      g[c.args._0] = { id: c.args._0, start: c.args._1, end: c.args._2 };
      return { out: '' };
    },
    undo: function (c) { delete c.dev.cfg.natGroups[c.args._0]; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'nat static <ip> <ip>', seq: 'nat',
    help: '配置一对一静态 NAT（内网地址 公网地址）',
    run: function (c) {
      var list = ensureStatic(c.dev);
      list.push({ local: c.args._0, global: c.args._1 });
      return { out: '' };
    },
    undo: function (c) {
      c.dev.cfg.natStatic = (c.dev.cfg.natStatic || []).filter(function (x) { return !(x.local === c.args._0 && x.global === c.args._1); });
      return { out: '' };
    }
  });

  /* ---------- 接口视图：NAT Outbound（SNAT） ---------- */
  R({
    views: ['interface'], pat: 'nat outbound <int>', seq: 'nat',
    help: '配置 Easy-IP：以本接口 IP 作为转换后地址（需 ACL 匹配私网流量）',
    run: function (c) {
      var fi = f(c); if (!fi) return { out: 'Interface does not exist', err: true };
      fi.natOutbound = { acl: c.args._0, group: null, noPat: false };
      return { out: '' };
    },
    undo: function (c) { f(c).natOutbound = null; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'nat outbound <int> address-group <int>', seq: 'nat',
    help: '配置 NAPT：以地址池地址作转换后地址',
    run: function (c) {
      var fi = f(c); if (!fi) return { out: 'Interface does not exist', err: true };
      fi.natOutbound = { acl: c.args._0, group: c.args._1, noPat: false };
      return { out: '' };
    },
    undo: function (c) { f(c).natOutbound = null; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'nat outbound <int> address-group <int> no-pat', seq: 'nat',
    help: '配置静态 NAT（地址池一对一，不做端口转换）',
    run: function (c) {
      var fi = f(c); if (!fi) return { out: 'Interface does not exist', err: true };
      fi.natOutbound = { acl: c.args._0, group: c.args._1, noPat: true };
      return { out: '' };
    },
    undo: function (c) { f(c).natOutbound = null; return { out: '' }; }
  });

  /* ---------- 接口视图：NAT Server（DNAT） ---------- */
  function addServer(c, proto) {
    var fi = f(c); if (!fi) return { out: 'Interface does not exist', err: true };
    if (!fi.natServer) fi.natServer = [];
    fi.natServer.push({ proto: proto, gip: c.args._1, gport: c.args._2, lip: c.args._3, lport: c.args._4 });
    return { out: '' };
  }
  function delServer(c, proto) {
    var fi = f(c); if (!fi || !fi.natServer) return { out: '' };
    fi.natServer = fi.natServer.filter(function (s) {
      return !(s.proto === proto && s.gip === c.args._1 && s.gport === c.args._2 && s.lip === c.args._3 && s.lport === c.args._4);
    });
    return { out: '' };
  }
  R({
    views: ['interface'], pat: 'nat server protocol +tcp|udp global <ip> <int> inside <ip> <int>', seq: 'nat',
    help: '配置内部服务器映射（公网地址:端口 → 内网地址:端口）',
    run: function (c) { return addServer(c, c.args._0); },
    undo: function (c) { return delServer(c, c.args._0); }
  });

})(window.H3C);
