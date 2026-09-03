/* H3C 网络仿真实验室 - 全局状态与持久化 */
(function (H) {
  'use strict';
  var U = H.U;

  var STORE_KEY = 'h3c-sim-lab-v1';
  var listeners = {};

  var S = {
    devices: [],
    links: [],
    meta: { title: '未命名拓扑', scale: 1, tx: 0, ty: 0, grid: true, showLabels: true, animate: true },
    sessions: {},   // deviceId -> { viewStack, history, buffer, mode }
    activeDevice: null,
    dirty: false
  };

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, a, b) {
    (listeners[ev] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.error(e); } });
    if (ev !== 'dirty') emit('dirty');
  }

  /* ---------- 设备 ---------- */
  function addDevice(modelId, name, x, y) {
    var dev = H.Model.newDevice(modelId, name, x, y);
    S.devices.push(dev);
    emit('device-add', dev); emit('change');
    return dev;
  }
  function removeDevice(id) {
    var i = S.devices.findIndex(function (d) { return d.id === id; });
    if (i < 0) return;
    S.links = S.links.filter(function (l) { return l.a.dev !== id && l.b.dev !== id; });
    var d = S.devices[i]; S.devices.splice(i, 1);
    delete S.sessions[id];
    if (S.activeDevice === id) S.activeDevice = null;
    emit('change');
  }
  function getDevice(id) { return S.devices.filter(function (d) { return d.id === id; })[0] || null; }
  function getDeviceByName(n) {
    n = String(n || '').toLowerCase();
    return S.devices.filter(function (d) { return (d.cfg.hostname || d.name).toLowerCase() === n; })[0] || null;
  }
  function uniqueName(base) {
    var used = {}; S.devices.forEach(function (d) { used[d.name] = 1; });
    if (!used[base]) return base;
    var i = 2; while (used[base + i]) i++; return base + i;
  }
  function uniqueHostname(base) {
    var used = {}; S.devices.forEach(function (d) { used[(d.cfg.hostname || '').toLowerCase()] = 1; });
    if (!used[base.toLowerCase()]) return base;
    var i = 2; while (used[(base + i).toLowerCase()]) i++; return base + i;
  }
  function allHostnames() { return S.devices.map(function (d) { return d.cfg.sysname || d.cfg.hostname; }); }

  /* ---------- 链路 ---------- */
  function portKey(devId, portName) { return devId + '::' + portName; }
  function linkExists(aDev, aPort, bDev, bPort) {
    return S.links.some(function (l) {
      return (l.a.dev === aDev && l.a.port === aPort && l.b.dev === bDev && l.b.port === bPort) ||
        (l.a.dev === bDev && l.a.port === aPort && l.b.dev === aDev && l.b.port === bPort);
    });
  }
  function portLinked(devId, portName) {
    return S.links.some(function (l) { return (l.a.dev === devId && l.a.port === portName) || (l.b.dev === devId && l.b.port === portName); });
  }
  function addLink(aDev, aPort, bDev, bPort) {
    if (aDev === bDev) return { err: '不能将设备连接到自身的端口。' };
    if (linkExists(aDev, aPort, bDev, bPort)) return { err: '该连接已存在。' };
    if (portLinked(aDev, aPort)) return { err: '端口 ' + aPort + ' 已被占用。' };
    if (portLinked(bDev, bPort)) return { err: '端口 ' + bPort + ' 已被占用。' };
    var l = { id: 'lnk_' + Math.random().toString(36).slice(2, 9), a: { dev: aDev, port: aPort }, b: { dev: bDev, port: bPort }, style: 'auto', note: '' };
    S.links.push(l);
    emit('link-add', l); emit('change');
    return { link: l };
  }
  function removeLink(id) {
    var i = S.links.findIndex(function (l) { return l.id === id; });
    if (i < 0) return; S.links.splice(i, 1); emit('change');
  }
  function getLink(id) { return S.links.filter(function (l) { return l.id === id; })[0] || null; }
  function linksOf(devId) {
    return S.links.filter(function (l) { return l.a.dev === devId || l.b.dev === devId; });
  }
  function getPeer(devId, portName) {
    for (var i = 0; i < S.links.length; i++) {
      var l = S.links[i];
      if (l.a.dev === devId && l.a.port === portName) return { dev: l.b.dev, port: l.b.port, link: l };
      if (l.b.dev === devId && l.b.port === portName) return { dev: l.a.dev, port: l.a.port, link: l };
    }
    return null;
  }

  /* ---------- 接口 ---------- */
  function getIface(dev, name) {
    if (!dev) return null;
    if (dev.cfg.ifaces) return dev.cfg.ifaces[name] || null;
    return null;
  }
  /* 新建 ifaces 容器（旧数据兼容） */
  function ensureIfaces(dev) {
    if (!dev.cfg.ifaces) {
      dev.cfg.ifaces = {};
      dev.ports.forEach(function (p) { dev.cfg.ifaces[p.name] = H.Model.defaultIface(p); });
    }
    return dev.cfg.ifaces;
  }

  /* ---------- 会话 ---------- */
  function getSession(devId) {
    if (!S.sessions[devId]) {
      S.sessions[devId] = {
        stack: [{ view: 'user', arg: null }],
        history: [], histIdx: -1, buffer: [],
        input: '', mode: 'cli', connect: null
      };
    }
    return S.sessions[devId];
  }

  /* ---------- 持久化 ---------- */
  function serialize() {
    return {
      v: 1, title: S.meta.title,
      devices: S.devices.map(function (d) {
        return { id: d.id, model: d.model, type: d.type, l3: d.l3, level: d.level, name: d.name, x: d.x, y: d.y, cfg: d.cfg };
      }),
      links: S.links
    };
  }
  function loadData(data, keepView) {
    if (!data || !data.devices) return false;
    S.links = data.links || [];
    S.devices = data.devices.map(function (d) {
      var dev = H.Model.newDevice(d.model, d.name, d.x, d.y);
      dev.id = d.id;
      if (d.cfg) { dev.cfg = Object.assign({}, dev.cfg, d.cfg); }
      H.Model && ensureIfaces(dev);
      return dev;
    });
    S.sessions = {};
    S.meta.title = data.title || '未命名拓扑';
    S.activeDevice = null;
    emit('change'); emit('reload');
    return true;
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(serialize()));
      S.dirty = false; return true;
    } catch (e) { return false; }
  }
  function loadLocal() {
    try {
      var s = localStorage.getItem(STORE_KEY); if (!s) return false;
      return loadData(JSON.parse(s));
    } catch (e) { return false; }
  }
  function clearAll() {
    S.devices = []; S.links = []; S.sessions = {}; S.activeDevice = null;
    emit('change'); emit('reload');
  }

  H.S = S;
  H.State = {
    S: S,
    on: on, emit: emit,
    addDevice: addDevice, removeDevice: removeDevice, getDevice: getDevice,
    getDeviceByName: getDeviceByName, uniqueName: uniqueName, uniqueHostname: uniqueHostname,
    allHostnames: allHostnames,
    addLink: addLink, removeLink: removeLink, getLink: getLink, linksOf: linksOf, getPeer: getPeer,
    portLinked: portLinked, linkExists: linkExists,
    getIface: getIface, ensureIfaces: ensureIfaces,
    getSession: getSession,
    serialize: serialize, loadData: loadData, saveLocal: saveLocal, loadLocal: loadLocal, clearAll: clearAll
  };
})(window.H3C);
