/* 探针：接口视图直切 + interface range 批量配置
 * 用法: node tools/probe_ifrange.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'C:/Users/Admin/WorkBuddy/岳科院教学工作/h3c-sim';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://localhost/h3c-sim/index.html', runScripts: 'outside-only', resources: 'usable', pretendToBeVisual: true });
const { window } = dom;
function makeCtx() {
  var base = { font: '12px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1 };
  return new Proxy(base, {
    get: function (t, p) {
      if (p === 'canvas') return window.document.createElement('canvas');
      if (p === 'measureText') return function (s) { return { width: String(s == null ? '' : s).length * 7 }; };
      if (p in t) return t[p];
      return function () { return makeCtx(); };
    },
    set: function (t, p, v) { t[p] = v; return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
window.console.error = function () { };
const scripts = [
  'js/core/utils.js', 'js/core/version.js', 'js/core/models.js', 'js/core/state.js', 'js/core/engine.js',
  'js/core/host.js', 'js/core/sim.js',
  'js/cmds/base.js', 'js/cmds/l2.js', 'js/cmds/l3.js', 'js/cmds/route.js',
  'js/cmds/wan.js', 'js/cmds/nat.js', 'js/cmds/acl.js', 'js/cmds/qos.js', 'js/cmds/sec.js', 'js/cmds/nms.js',
  'js/cmds/monitor.js', 'js/cmds/config.js',
  'js/ui/topology.js', 'js/ui/terminal.js', 'js/ui/app.js'
];
scripts.forEach(rel => {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try { window.eval(code); } catch (e) { console.log('[eval FAIL]', rel, e.message); }
});

const H = window.H3C, S = H.State, E = H.Engine;
let pass = 0, fail = 0;
function ok(c, name, extra) {
  if (c) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

/* 建一台交换机 + 会话 */
const dev = S.addDevice('S5130-28S-EI', 'SW1', 100, 100);
const sess = S.getSession(dev.id);
function x(line) { return E.exec(dev, sess, line); }
function prompt() { return E.promptFor(dev, sess); }
function iface(n) { return dev.cfg.ifaces[n]; }
function depth() { return sess.stack.length; }

console.log('\n=== A. 接口视图之间直接跳转 ===');
x('system-view');
ok(prompt() === '[SW1]', 'system-view 提示符 [SW1]', prompt());
x('interface GE1/0/1');
ok(prompt() === '[SW1-GE1/0/1]', 'int GE1/0/1 提示符', prompt());
const d1 = depth();
let r = x('interface GE1/0/2');
ok(!r.err, '接口视图内可直接 int GE1/0/2（无需 quit）', JSON.stringify(r.out));
ok(prompt() === '[SW1-GE1/0/2]', '直切后提示符变为 [SW1-GE1/0/2]', prompt());
ok(depth() === d1, '直切不压栈（栈深度不变=' + depth() + '）', depth());
x('description to-pc2');
ok(iface('GE1/0/2').desc === 'to-pc2', '配置落在 GE1/0/2 上', iface('GE1/0/2').desc);
ok(!iface('GE1/0/1').desc, 'GE1/0/1 未被误配', iface('GE1/0/1').desc);
x('int g1/0/3');
ok(prompt() === '[SW1-GE1/0/3]', '缩写 int g1/0/3 也可直切', prompt());
x('quit');
ok(prompt() === '[SW1]', '一次 quit 直接回到系统视图', prompt());

console.log('\n=== B. 端口视图 -> VLAN 接口视图 ===');
x('int GE1/0/1');
r = x('interface Vlan-interface 10');
ok(!r.err, '端口视图内可直接进 VLAN 接口', JSON.stringify(r.out));
ok(prompt() === '[SW1-VLAN10]', 'VLAN 接口提示符', prompt());
ok(iface('VLAN10') && iface('VLAN10').mode === 'route', 'Vlan-interface10 已创建且为三层模式');
x('int vlan 20');
ok(prompt() === '[SW1-VLAN20]', 'vlan 接口之间也可直切', prompt());
x('quit');
ok(prompt() === '[SW1]', 'quit 回系统视图', prompt());

console.log('\n=== C. interface range 批量配置 ===');
r = x('int range GE1/0/1 to GE1/0/5');
ok(!r.err, 'int range GE1/0/1 to GE1/0/5 可执行', JSON.stringify(r.out));
ok(prompt() === '[SW1-if-range]', '提示符变为 [SW1-if-range]', prompt());
r = x('port link-type access');
ok(!r.err, 'range 下 port link-type access 无报错', JSON.stringify(r.out));
let allAcc = true, accList = [];
for (let i = 1; i <= 5; i++) { const f = iface('GE1/0/' + i); accList.push(f.linkType); if (f.linkType !== 'access') allAcc = false; }
ok(allAcc, 'GE1/0/1~5 全部变成 access', accList.join(','));
r = x('port access vlan 20');
ok(!r.err, 'range 下 port access vlan 20 无报错', JSON.stringify(r.out));
let allV20 = true, vList = [];
for (let i = 1; i <= 5; i++) { const f = iface('GE1/0/' + i); vList.push(f.accessVlan); if (f.accessVlan !== 20) allV20 = false; }
ok(allV20, 'GE1/0/1~5 access vlan 均为 20', vList.join(','));
ok(iface('GE1/0/6').accessVlan !== 20, '范围外的 GE1/0/6 未被配入 VLAN 20', iface('GE1/0/6').accessVlan);
x('quit');
ok(prompt() === '[SW1]', 'range 视图 quit 回系统视图', prompt());

console.log('\n=== D. range 的多种写法 ===');
r = x('int ran g1/0/6 to g1/0/8');
ok(!r.err && prompt() === '[SW1-if-range]', '缩写 int ran + 小写短名可识别', prompt() + ' | ' + JSON.stringify(r.out));
x('port link-type trunk');
let allTr = true;
for (let i = 6; i <= 8; i++) if (iface('GE1/0/' + i).linkType !== 'trunk') allTr = false;
ok(allTr, 'GE1/0/6~8 全部 trunk');
r = x('port trunk permit vlan 10 20');
ok(!r.err, 'range 下 port trunk permit vlan 10 20（空格分隔）', JSON.stringify(r.out));
let pv = iface('GE1/0/6').trunkVlans || iface('GE1/0/6').permitVlans;
ok(!!pv && pv.indexOf(10) >= 0 && pv.indexOf(20) >= 0, 'trunk permit 对三个口都生效', JSON.stringify(pv));
x('quit');

r = x('interface range GigabitEthernet 1/0/11 to GigabitEthernet 1/0/14');
ok(!r.err && prompt() === '[SW1-if-range]', '全名带空格写法可解析', prompt() + ' | ' + JSON.stringify(r.out));
x('port link-type access');
let ok1114 = true;
for (let i = 11; i <= 14; i++) if (iface('GE1/0/' + i).linkType !== 'access') ok1114 = false;
ok(ok1114, 'GE1/0/11~14 批量 access 生效');
x('quit');

r = x('int range g1/0/21,g1/0/23');
ok(!r.err && prompt() === '[SW1-if-range]', '逗号分隔离散端口可解析', prompt());
x('port access vlan 30');
ok(iface('GE1/0/21').accessVlan === 30 && iface('GE1/0/23').accessVlan === 30, '离散端口批量生效');
ok(iface('GE1/0/22').accessVlan !== 30, '中间端口 22 未被配入 VLAN 30', iface('GE1/0/22').accessVlan);
x('quit');

console.log('\n=== E. range 视图也支持直切 ===');
x('int GE1/0/1');
ok(prompt() === '[SW1-GE1/0/1]', '先进入单端口视图', prompt());
const dE = depth();
r = x('int range g1/0/2 to g1/0/4');
ok(!r.err && prompt() === '[SW1-if-range]', '端口视图内可直接切到 range 视图', prompt());
ok(depth() === dE, 'range 直切同样不压栈（' + depth() + '）', depth());
x('port link-type trunk');
let okE = true;
for (let i = 2; i <= 4; i++) if (iface('GE1/0/' + i).linkType !== 'trunk') okE = false;
ok(okE, 'GE1/0/2~4 批量 trunk 生效');
r = x('int g1/0/9');
ok(!r.err && prompt() === '[SW1-GE1/0/9]', 'range 视图内可直切回单端口', prompt());
x('quit');
ok(prompt() === '[SW1]', 'quit 回系统视图', prompt());

console.log('\n=== F. range 下 undo / display 不崩 ===');
x('int range GE1/0/1 to GE1/0/3');
r = x('undo port link-type');
ok(!r.err, 'range 下 undo 命令可执行', JSON.stringify(r.out));
let undone = true;
for (let i = 1; i <= 3; i++) if (iface('GE1/0/' + i).accessVlan !== 1 || iface('GE1/0/' + i).linkType !== 'access') undone = false;
ok(undone, 'undo 对范围内三个口都生效（恢复默认 access vlan 1）');
r = x('display this');
ok(!r.err && typeof r.out === 'string' && r.out.length > 0, 'range 下 display this 正常输出', JSON.stringify(String(r.out).slice(0, 60)));
r = x('shutdown');
ok(!r.err, 'range 下 shutdown 可执行');
let allDown = true;
for (let i = 1; i <= 3; i++) if (iface('GE1/0/' + i).adminUp !== false) allDown = false;
ok(allDown, 'GE1/0/1~3 全部 shutdown');
x('quit');

console.log('\n=== G. 非法 range 参数给出错误提示 ===');
r = x('int range GE1/0/99 to GE1/0/120');
ok(!!r.err, '不存在的端口范围报错', JSON.stringify(r.out));
ok(prompt() === '[SW1]', '失败时不进入 range 视图', prompt());

console.log('\n结果: PASS=' + pass + '  FAIL=' + fail);
process.exit(fail ? 1 : 0);
