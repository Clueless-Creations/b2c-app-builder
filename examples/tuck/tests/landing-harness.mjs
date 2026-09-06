import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

export const PRIMARY = 'tuck.weekend.v1';
export const BACKUP = 'tuck.weekend.backup.v1';
export const RECOVERY = 'tuck.weekend.recovery.v1';

/** Executes the actual landing module with controlled storage and minimal DOM sinks.
 * This harness does not establish browser layout, native keyboard semantics, or focus behavior.
 * Those require the independent browser interaction checks recorded alongside these tests.
 */
export function loadLanding(initial = new Map(), options = {}) {
  const storage = new Map(initial);
  const elements = new Map();
  let active;
  const timers = new Map();
  let nextTimer = 0;
  class Element {
    constructor(selector = '') {
      this.selector = selector;
      this.children = [];
      this.listeners = new Map();
      this.dataset = {};
      this.style = {};
      this.attributes = new Map();
      this.className = '';
      this.hidden = false;
      this.value = '';
      this.textContent = '';
      this.classList = {
        contains: (name) => this.className.split(' ').includes(name),
        toggle: (name, enabled) => {
          const values = new Set(this.className.split(' ').filter(Boolean));
          const add = enabled ?? !values.has(name);
          if (add) values.add(name); else values.delete(name);
          this.className = [...values].join(' ');
        },
        add: (name) => this.classList.toggle(name, true),
        remove: (name) => this.classList.toggle(name, false),
      };
    }
    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) ?? new Set();
      listeners.add(listener);
      this.listeners.set(name, listeners);
    }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    async dispatch(name, data = {}) {
      const event = { type: name, target: this, preventDefault() {}, ...data };
      for (const listener of [...(this.listeners.get(name) ?? [])]) await listener(event);
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { active = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    remove() {}
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 200, right: 400, top: 200, bottom: 400 }; }
    click() { return this.dispatch('click'); }
  }
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element(selector));
    return elements.get(selector);
  };
  element('#object-geometry').textContent = readFileSync(new URL('../shared/object-geometry.json', import.meta.url), 'utf8');
  const document = {
    querySelector: (selector) => {
      const id = /^\[data-item-id="([^"]+)"\] \.pack-item$/.exec(selector)?.[1];
      if (id) return element('#items').children.find((row) => row.dataset.itemId === id)?.children[0];
      return element(selector);
    },
    querySelectorAll: () => [],
    createElement: (name) => new Element(name),
    documentElement: element('html'),
    body: element('body'),
    get activeElement() { return active; },
  };
  const context = vm.createContext({
    document, structuredClone, console, Blob, URL,
    crypto: { randomUUID }, CSS: { escape: (value) => value },
    localStorage: {
      getItem: (key) => { if (options.failRead) throw new Error('storage unavailable'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (options.failWrite === key) throw new Error('quota exceeded'); storage.set(key, String(value)); },
      removeItem: (key) => storage.delete(key),
    },
    setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => callback(),
  });
  vm.runInContext(readFileSync(new URL('../landing/app.js', import.meta.url), 'utf8'), context, { filename: 'landing/app.js' });
  const evaluate = (expression) => vm.runInContext(expression, context);
  return {
    storage, options, element, document, evaluate,
    state: () => JSON.parse(evaluate('JSON.stringify(state)')),
    pack: (id) => evaluate(`togglePacked(${JSON.stringify(id)})`),
    click: (selector) => element(selector).dispatch('click'),
    importFile: async (contents, size = Buffer.byteLength(contents)) => {
      const input = element('#import-list');
      input.files = [{ size, text: async () => contents }];
      await input.dispatch('change');
    },
  };
}
