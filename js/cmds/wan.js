/* 广域网接入：串口链路封装（PPP/HDLC）与 PPP 认证（PAP/CHAP） */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  function f(c) { return c.dev.cfg.ifaces[c.view.arg]; }

  /* ---------- 链路封装 ---------- */
  R({
    views: ['interface'], pat: 'link-protocol ppp', seq: 'wan',
    help: '配置串口链路封装协议为 PPP（默认）',
    run: function (c) { f(c).linkProtocol = 'ppp'; return { out: '' }; },
    undo: function (c) { f(c).linkProtocol = 'ppp'; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'link-protocol hdlc', seq: 'wan',
    help: '配置串口链路封装协议为 HDLC',
    run: function (c) { f(c).linkProtocol = 'hdlc'; return { out: '' }; },
    undo: function (c) { f(c).linkProtocol = 'ppp'; return { out: '' }; }
  });

  /* ---------- PPP 认证（认证方） ---------- */
  R({
    views: ['interface'], pat: 'ppp authentication-mode +pap|chap', seq: 'wan',
    help: '配置本端 PPP 认证方式（对端接入时需通过认证）',
    run: function (c) { f(c).pppAuth.mode = (c.args._0 || '').toLowerCase(); return { out: '' }; },
    undo: function (c) { f(c).pppAuth.mode = 'none'; return { out: '' }; }
  });

  /* ---------- PPP 认证（被认证方呈交的凭据） ---------- */
  R({
    views: ['interface'], pat: 'ppp pap local-user <word> password <text>', seq: 'wan',
    help: '配置 PAP 认证用户名与密码（向对端发送）',
    run: function (c) { f(c).pppAuth.user = c.args.word; f(c).pppAuth.password = c.args.text; return { out: '' }; },
    undo: function (c) { f(c).pppAuth.user = ''; f(c).pppAuth.password = ''; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ppp chap user <word>', seq: 'wan',
    help: '配置 CHAP 认证用户名（向对端发送）',
    run: function (c) { f(c).pppAuth.user = c.args.word; return { out: '' }; },
    undo: function (c) { f(c).pppAuth.user = ''; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ppp chap password <text>', seq: 'wan',
    help: '配置 CHAP 认证密码（向对端发送）',
    run: function (c) { f(c).pppAuth.password = c.args.text; return { out: '' }; },
    undo: function (c) { f(c).pppAuth.password = ''; return { out: '' }; }
  });

})(window.H3C);
