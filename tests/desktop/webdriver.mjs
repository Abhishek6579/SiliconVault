import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';

const KEY = 'element-6066-11e4-a52e-4f735466cecf';
const elementId = (value) => value?.[KEY] ?? value?.ELEMENT;

export class DesktopWebDriver {
  constructor() {
    this.url = process.env.TAURI_WEBDRIVER_URL || 'http://127.0.0.1:4444';
    this.app = path.resolve(process.env.TAURI_APPLICATION_PATH || path.join(
      process.cwd(), 'src-tauri', 'target', 'debug',
      process.platform === 'win32' ? 'silicon-vault.exe' : 'silicon-vault',
    ));
    this.driverPath = process.env.TAURI_DRIVER_PATH || path.join(
      homedir(), '.cargo', 'bin',
      process.platform === 'win32' ? 'tauri-driver.exe' : 'tauri-driver',
    );
    this.session = null;
    this.driver = null;
    this.profile = null;
    this.appPid = null;
  }

  async request(route, method = 'GET', body) {
    const response = await fetch(this.url + route, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json; charset=utf-8' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(35_000),
    });
    const raw = await response.text();
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error('WebDriver returned non-JSON: ' + raw.slice(0, 400)); }
    const value = result.value ?? result;
    if (!response.ok || value.error) throw new Error('WebDriver ' + method + ' ' + route + ': ' + (value.message || raw));
    return value;
  }

  appPids() {
    const result = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='silicon-vault.exe'\" | ForEach-Object { $_.ProcessId }"], { encoding: 'utf8', windowsHide: true })
      : spawnSync('pgrep', ['-x', 'silicon-vault'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    return new Set((result.stdout || '').split(/\s+/).map(Number).filter(Number.isInteger));
  }

  async start() {
    await access(this.app);
    await access(this.driverPath);
    this.profile = await mkdtemp(path.join(tmpdir(), 'siliconvault-desktop-'));
    const env = { ...process.env };
    if (process.platform === 'win32') {
      env.APPDATA = path.join(this.profile, 'Roaming');
      env.LOCALAPPDATA = path.join(this.profile, 'Local');
      await Promise.all([mkdir(env.APPDATA, { recursive: true }), mkdir(env.LOCALAPPDATA, { recursive: true })]);
    } else {
      env.XDG_DATA_HOME = path.join(this.profile, 'data');
      env.XDG_CONFIG_HOME = path.join(this.profile, 'config');
      env.XDG_CACHE_HOME = path.join(this.profile, 'cache');
      await Promise.all([mkdir(env.XDG_DATA_HOME), mkdir(env.XDG_CONFIG_HOME), mkdir(env.XDG_CACHE_HOME)]);
    }
    this.driver = spawn(this.driverPath, [], { stdio: 'inherit', windowsHide: true, env });
    const deadline = Date.now() + 25_000;
    let lastError;
    while (Date.now() < deadline) {
      if (this.driver.exitCode !== null) throw new Error('tauri-driver exited before readiness.');
      try { await this.request('/status'); lastError = null; break; }
      catch (error) { lastError = error; await delay(250); }
    }
    if (lastError) throw new Error('tauri-driver did not start: ' + lastError.message);
    await this.createSession();
  }

  async createSession() {
    const before = this.appPids();
    const value = await this.request('/session', 'POST', {
      capabilities: { alwaysMatch: { browserName: 'wry', 'tauri:options': { application: this.app } } },
    });
    this.session = value.sessionId;
    if (!this.session) throw new Error('tauri-driver returned no session ID.');
    await this.request('/session/' + this.session + '/timeouts', 'POST', { implicit: 0, pageLoad: 30_000, script: 30_000 });
    this.appPid = await this.waitFor(() => {
      const current = this.appPids();
      return [...current].find((pid) => !before.has(pid)) || false;
    }, 20_000, 'new SiliconVault process');
  }

  endpoint(suffix) {
    if (!this.session) throw new Error('No active desktop WebDriver session.');
    return '/session/' + this.session + suffix;
  }

  async closeSession() {
    if (!this.session) return;
    const id = this.session;
    this.session = null;
    try { await this.request('/session/' + id, 'DELETE'); }
    catch (error) {
      if (!/invalid session|session not found|no such window|connection|ECONNREFUSED/i.test(error.message)) throw error;
    }
  }

  async waitForAppReady(timeout = 30_000) {
    await this.waitFor(
      () => this.execute('return Boolean(document.querySelector(".app-shell .workspace-switch-button")) && !document.querySelector(".startup-screen");'),
      timeout,
      'SiliconVault startup to finish',
    );
  }

  async restart() {
    await this.closeSession();
    await delay(700);
    await this.createSession();
    await this.waitForAppReady();
  }

  async crashAndRestart() {
    if (!this.appPid) throw new Error('Could not identify the test application process.');
    const result = process.platform === 'win32'
      ? spawnSync('taskkill', ['/PID', String(this.appPid), '/T', '/F'], { encoding: 'utf8', windowsHide: true })
      : (() => { try { process.kill(this.appPid, 'SIGKILL'); return { status: 0 }; } catch (error) { return { status: 1, error }; } })();
    if (result.error || result.status !== 0) throw new Error('Could not stop test process: ' + (result.error?.message || result.stderr || result.status));
    this.appPid = null;
    await delay(500);
    await this.closeSession();
    await this.createSession();
    await this.waitForAppReady();
  }

  async stop() {
    await this.closeSession();
    if (this.driver && this.driver.exitCode === null) {
      this.driver.kill();
      await Promise.race([new Promise((resolve) => this.driver.once('exit', resolve)), delay(2_000)]);
    }
    this.driver = null;
    if (this.profile) await rm(this.profile, { recursive: true, force: true });
    this.profile = null;
  }

  async findCss(selector) {
    const value = await this.request(this.endpoint('/element'), 'POST', { using: 'css selector', value: selector });
    const id = elementId(value);
    if (!id) throw new Error('No element matched: ' + selector);
    return id;
  }

  async findText(selector, text, exact = false) {
    const result = await this.execute(
      'return [...document.querySelectorAll(arguments[0])].find((el) => { const s=(el.innerText||el.textContent||"").replace(/\\s+/g," ").trim(); return arguments[2] ? s===arguments[1] : s.includes(arguments[1]); }) || null;',
      selector, text, exact,
    );
    const id = elementId(result);
    if (!id) throw new Error('No ' + selector + ' contains "' + text + '".');
    return id;
  }

  async click(selector) {
    const id = await this.findCss(selector);
    try {
      await this.request(this.endpoint('/element/' + id + '/click'), 'POST', {});
    } catch (error) {
      if (!/element click intercepted|element not interactable|element is not clickable/i.test(error.message)) throw error;
      // WebKitWebDriver can report a hit-test interception for controls that are
      // visible in the app's embedded WebView. Scroll first, then use the
      // element's native DOM click as a narrowly-scoped fallback.
      await this.execute(
        'const el=document.querySelector(arguments[0]); if(!el) throw new Error("Click target disappeared"); el.scrollIntoView({block:"center",inline:"center"}); el.click(); return true;',
        selector,
      );
    }
  }

  async clickText(selector, text, exact = false) {
    const id = await this.findText(selector, text, exact);
    try {
      await this.request(this.endpoint('/element/' + id + '/click'), 'POST', {});
    } catch (error) {
      if (!/element click intercepted|element not interactable|element is not clickable/i.test(error.message)) throw error;
      await this.execute(
        'const el=[...document.querySelectorAll(arguments[0])].find((node)=>{const value=(node.innerText||node.textContent||"").replace(/\\s+/g," ").trim();return arguments[2]?value===arguments[1]:value.includes(arguments[1]);}); if(!el) throw new Error("Text click target disappeared"); el.scrollIntoView({block:"center",inline:"center"}); el.click(); return true;',
        selector, text, exact,
      );
    }
  }

  async clear(selector) {
    const id = await this.findCss(selector);
    await this.request(this.endpoint('/element/' + id + '/clear'), 'POST', {});
  }

  async sendKeys(selector, value) {
    const id = await this.findCss(selector);
    await this.request(this.endpoint('/element/' + id + '/value'), 'POST', { text: value, value: Array.from(value) });
  }

  async text(selector) {
    const id = await this.findCss(selector);
    return this.request(this.endpoint('/element/' + id + '/text'));
  }

  async value(selector) {
    return this.execute('return document.querySelector(arguments[0])?.value ?? null;', selector);
  }

  async attribute(selector, name) {
    const id = await this.findCss(selector);
    return this.request(this.endpoint('/element/' + id + '/attribute/' + encodeURIComponent(name)));
  }

  async execute(script, ...args) {
    return this.request(this.endpoint('/execute/sync'), 'POST', { script, args });
  }

  async waitForCss(selector, timeout = 10_000) {
    return this.waitFor(async () => {
      try { return await this.findCss(selector); } catch { return false; }
    }, timeout, 'element ' + selector);
  }

  async waitForText(selector, text, timeout = 10_000) {
    return this.waitFor(() => this.execute(
      'return [...document.querySelectorAll(arguments[0])].some((el) => (el.innerText||el.textContent||"").includes(arguments[1]));',
      selector, text,
    ), timeout, '"' + text + '" in ' + selector);
  }

  async waitFor(callback, timeout, label) {
    const end = Date.now() + timeout;
    let lastError;
    while (Date.now() < end) {
      try { const result = await callback(); if (result) return result; }
      catch (error) { lastError = error; }
      await delay(120);
    }
    throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError.message : ''));
  }

  async dropFiles(selector, files) {
    await this.execute(
      'const target=document.querySelector(arguments[0]); if(!target) throw new Error("Drop target missing"); const dt=new DataTransfer(); for(const f of arguments[1]) dt.items.add(new File([f.content],f.name,{type:f.type})); target.dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:dt})); target.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:dt})); return true;',
      selector, files,
    );
  }

  async dragItem(sourceSelector, targetSelector) {
    const result = await this.execute(
      'const source=document.querySelector(arguments[0]),target=document.querySelector(arguments[1]);' +
      'if(!source||!target) throw new Error("Drag source or target missing");' +
      'if(typeof DataTransfer!=="function"||typeof DragEvent!=="function") throw new Error("This WebView does not support HTML5 DataTransfer drag events");' +
      'const dataTransfer=new DataTransfer();' +
      'const options={bubbles:true,cancelable:true,dataTransfer};' +
      'source.dispatchEvent(new DragEvent("dragstart",options));' +
      'const payload=dataTransfer.getData("application/x-workbench-item");' +
      'if(!payload) throw new Error("The source row did not publish a workbench drag payload");' +
      'target.dispatchEvent(new DragEvent("dragenter",options));' +
      'target.dispatchEvent(new DragEvent("dragover",options));' +
      'const dropEvent=new DragEvent("drop",options); target.dispatchEvent(dropEvent);' +
      'source.dispatchEvent(new DragEvent("dragend",options));' +
      'return {payload,dropPrevented:dropEvent.defaultPrevented};',
      sourceSelector, targetSelector,
    );
    if (!result?.payload || !result.dropPrevented) {
      throw new Error('The destination did not accept the internal drag payload.');
    }
    return JSON.parse(result.payload);
  }

  async setFileInput(selector, name, content, mimeType = 'application/json') {
    return this.execute(
      'const input=document.querySelector(arguments[0]); if(!input) throw new Error("File input missing"); const dt=new DataTransfer(); dt.items.add(new File([arguments[2]],arguments[1],{type:arguments[3]})); input.files=dt.files; input.dispatchEvent(new Event("change",{bubbles:true})); return input.files.length;',
      selector, name, content, mimeType,
    );
  }
}
