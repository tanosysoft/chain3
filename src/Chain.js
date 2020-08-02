import d from '@dominant/core';

let timeout = dl => new Promise(r => setTimeout(r, dl));

class Chain extends d.Component {
  static el(type, props, ...children) {
    children = children.map(x => {
      if (typeof x === 'function') {
        let n = d.comment(`chain: ${x.name || 'anonymous'}`);
        n.chainFn = x;

        return n;
      }

      return x;
    });

    return d.el(type, props, ...children);
  }

  static if(predFn, nThen, nElse) {
    let cIf = d.comment('chain: if');
    let cElse = d.comment('chain: else');

    cIf.chainIf = predFn;
    nThen.chainThen = cIf;

    let ret = [cIf, nThen];

    if (nElse) {
      cElse.chainElse = cIf;
      nElse.chainElse = cIf;

      ret.push(cElse, nElse);
    }

    return ret;
  }

  static shield({ children, ...props }) {
    let el = d.el('div', props, ...children);
    el.chainShield = true;

    return el;
  }

  stack = [];
  queue = [];
  targetEl = null;
  dl = 100;
  lastCheckpoint = null;

  constructor(props) {
    super();

    this.props = props;
    this.lastCheckpoint = localStorage.getItem('chain3.lastCheckpoint');
  }

  get classes() {
    return d.resolve(this.props.class) || null;
  }

  cloneChildren = (
    xs = this.props.children,
    cloneMap = new Map(),
  ) => xs.map(x => {
    if (x instanceof Node) {
      let y = x.cloneNode(false);

      cloneMap.set(x, y);

      if (x.bindings) {
        y.bindings = x.bindings;
      }

      for (let k of Object.keys(x).filter(y => y.startsWith('chain'))) {
        let z = x[k];

        if (z instanceof Node) {
          let w = cloneMap.get(z);

          if (!w) {
            throw new Error(`Prop ${k} references a node not in the cloneMap`);
          }

          y[k] = w;

          continue;
        }

        y[k] = x[k];
      }

      if (x.childNodes && x.childNodes.length) {
        y.append(...this.cloneChildren([...x.childNodes], cloneMap));
      }

      return y;
    }

    return x;
  });

  rewind = toLabel => {
    this.stack = [];
    this.queue = this.cloneChildren();
    this.targetEl = this.el;

    let lengthBeforeRewind = this.el.childNodes.length;
    let lastChildBeforeRewind = this.el.lastChild;

    if (toLabel) {
      let found = false;

      while (this.stack.length || this.queue.length) {
        if (!this.queue.length) {
          let prevState = this.stack.pop();

          this.queue = prevState.queue;
          this.targetEl = prevState.targetEl;

          continue;
        }

        let x = this.queue.shift();

        if (x.chainLabel === toLabel) {
          found = x;
          break;
        }

        if (x.childNodes && x.childNodes.length) {
          this.stack.push({
            targetEl: this.targetEl,
            queue: this.queue,
          });

          this.queue = [...x.childNodes];
          x.innerHTML = '';

          this.targetEl.append(x);
          this.targetEl = x;
        }
      }

      if (!found) {
        throw new Error(`Label not found: ${toLabel}`);
      }

      while (this.el.childNodes[0] && !this.el.childNodes[0].contains?.(found)) {
        this.el.childNodes[0].remove();
      }
    }
  };

  run = async fromLabel => {
    this.rewind(fromLabel);

    while (this.stack.length || this.queue.length) {
      if (!this.queue.length) {
        let prevState = this.stack.pop();

        this.queue = prevState.queue;
        this.targetEl = prevState.targetEl;

        continue;
      }

      let x = this.queue.shift();

      if (x instanceof Text) {
        await this.typewrite(this.targetEl, x.textContent);
        continue;
      }

      if (x instanceof Node) {
        if (x.chainFn) {
          this.targetEl.append(x);
          let y = await x.chainFn(this, this.targetEl);

          if (typeof y === 'function') {
            await y(this, this.targetEl);
          }

          continue;
        }

        if (x.chainIf) {
          x.chainIfResult = Boolean(await x.chainIf());

          if (!x.chainIfResult) {
            continue;
          }
        }

        if (
          (x.chainThen && (x.chainThen.chainIfResult === undefined || !x.chainThen.chainIfResult)) ||
          (x.chainElse && (x.chainElse.chainIfResult === undefined || x.chainElse.chainIfResult))
        ) {
          continue;
        }

        if (x.chainShield) {
          continue;
        }

        if (!x.childNodes || !x.childNodes.length) {
          this.targetEl.append(x);
          continue;
        }

        this.stack.push({
          targetEl: this.targetEl,
          queue: this.queue,
        });

        this.queue = [...x.childNodes];
        x.innerHTML = '';

        this.targetEl.append(x);
        this.targetEl = x;

        continue;
      }

      if (typeof x === 'function') {
        let y = await x(this, this.targetEl);

        if (typeof y === 'function') {
          await y(this, this.targetEl);
        }

        continue;
      }

      await this.typewrite(this.targetEl, x);
    }
  };

  typewrite = async (el, x) => {
    x = String(x);

    for (let i = 0; i < x.length; i++) {
      await timeout(this.dl);
      el.append(document.createTextNode(x[i]));
    }
  };

  render = () => this.el = d.el('div', {
      onAttach: () => this.run(this.lastCheckpoint),
      class: ['Chain', () => this.classes],
  });
}

let clear = chain => chain.el.innerHTML = '';

let goTo = label => chain => chain.rewind(label);

let label = id => {
  let n = d.comment(`chain: label ${id}`);
  n.chainLabel = id;

  return n;
};

let checkpoint = id => [
  label(id),

  chain => {
    chain.lastCheckpoint = id;
    localStorage.setItem('chain3.lastCheckpoint', id);
  },
];

let sdl = dl => chain => chain.dl = dl;
let sec = s => () => timeout(s * 1000);

let w = (chain, el) => new Promise(resolve => {
  let cursor = d.el('span', { class: 'Chain-waitCursor' });
  el.append(cursor);

  let onClick = () => {
    document.removeEventListener('click', onClick);
    cursor.remove();

    resolve();
  };

  document.addEventListener('click', onClick);
});

export default Chain;
export { clear, goTo, label, checkpoint, sdl, sec, w };