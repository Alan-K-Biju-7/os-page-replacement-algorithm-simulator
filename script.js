/* Virtual Memory Paging — Algorithm Simulator
   Clean, modular ES6 implementation with FIFO · LRU · Optimal
   UI is rendered client-side for easy GitHub Pages hosting.
*/

(function () {
  // ---------- DOM helpers ----------
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => (n[k] = v));
    if (html) n.innerHTML = html;
    return n;
  };

  // ---------- UI Bootstrap ----------
  const app = qs("#app");
  app.innerHTML = `
    <div class="wrap">
      <header class="hero">
        <h1>Virtual Memory Paging Simulator</h1>
        <p>Simulate <strong>FIFO</strong>, <strong>LRU</strong>, and <strong>Optimal</strong> page replacement. Paste a reference string & choose frames.</p>
      </header>

      <div class="grid">
        <section class="card">
          <div class="row"><label for="refs">Reference String</label></div>
          <textarea id="refs" placeholder="e.g. 7 0 1 2 0 3 0 4 2 3 0 3 2">7 0 1 2 0 3 0 4 2 3 0 3 2</textarea>

          <div class="row mt">
            <div class="col">
              <label for="frames">Frames</label>
              <input id="frames" type="number" min="1" max="20" step="1" value="3" />
            </div>
            <div class="col-2">
              <label>Algorithms</label>
              <div class="chips">
                <label class="chip"><input type="checkbox" id="alg-fifo" checked> FIFO</label>
                <label class="chip"><input type="checkbox" id="alg-lru"  checked> LRU</label>
                <label class="chip"><input type="checkbox" id="alg-opt"  checked> Optimal</label>
              </div>
            </div>
          </div>

          <div class="controls">
            <button id="run" class="btn">Run Simulation</button>
            <button id="random" class="btn secondary">Random Sequence</button>
            <button id="clear" class="btn ghost">Clear</button>
            <span id="msg" class="muted small" role="status"></span>
          </div>
        </section>

        <section class="card">
          <div class="row space-between">
            <h3 class="m0">Results</h3>
            <div class="row small">
              <span class="badge"><span class="dot dot-ok"></span> Hit</span>
              <span class="badge"><span class="dot dot-bad"></span> Fault</span>
            </div>
          </div>
          <div id="results" class="results"></div>
          <details id="stepsToggle">
            <summary>Show step-by-step frames</summary>
            <div id="steps"></div>
          </details>
        </section>
      </div>

      <footer>
        <p>Tip: Numbers can be space or comma separated, e.g. <code>1,2,3,4,1,2,5,1,2,3,4,5</code>. Everything runs locally in your browser.</p>
      </footer>
    </div>
  `;

  // ---------- Wire refs ----------
  const refsEl = qs("#refs");
  const framesEl = qs("#frames");
  const runBtn = qs("#run");
  const randBtn = qs("#random");
  const clearBtn = qs("#clear");
  const msgEl = qs("#msg");
  const resEl = qs("#results");
  const stepsEl = qs("#steps");

  // ---------- Utils ----------
  const parseRefs = (text) => {
    const m = text.match(/-?\d+/g);
    return m ? m.map(Number) : [];
  };
  const clone = (a) => JSON.parse(JSON.stringify(a));
  const emptyFrames = (n) => Array.from({ length: n }, () => null);

  function metricCard(title, value, ratio = 1) {
    const pct = Math.max(2, Math.min(100, Math.round(ratio * 100)));
    const card = el("div", { className: "metric" });
    card.innerHTML = `
      <div class="title">${title}</div>
      <div class="value">${value}</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    `;
    return card;
  }

  // ---------- Algorithms (return faults + per-step states) ----------
  function simulateFIFO(refs, frames) {
    const state = [];
    let faults = 0;
    const mem = emptyFrames(frames);
    const q = []; // queue of frame indices in use order

    for (let t = 0; t < refs.length; t++) {
      const p = refs[t];
      let hit = false, victim = null;

      const idx = mem.indexOf(p);
      if (idx !== -1) {
        hit = true;
      } else {
        faults++;
        const empty = mem.indexOf(null);
        if (empty !== -1) {
          mem[empty] = p;
          q.push(empty);
        } else {
          const vicIdx = q.shift();
          victim = mem[vicIdx];
          mem[vicIdx] = p;
          q.push(vicIdx);
        }
      }
      state.push({ ref: p, hit, victim, frames: clone(mem) });
    }
    return { faults, state };
  }

  function simulateLRU(refs, frames) {
    const state = [];
    let faults = 0;
    const mem = emptyFrames(frames);
    const lastUsed = new Map(); // page -> time

    for (let t = 0; t < refs.length; t++) {
      const p = refs[t];
      let hit = false, victim = null;

      const idx = mem.indexOf(p);
      if (idx !== -1) {
        hit = true;
        lastUsed.set(p, t);
      } else {
        faults++;
        const empty = mem.indexOf(null);
        if (empty !== -1) {
          mem[empty] = p;
          lastUsed.set(p, t);
        } else {
          // Pick page with smallest lastUsed timestamp
          let minTime = Infinity, vicIdx = 0;
          for (let i = 0; i < mem.length; i++) {
            const page = mem[i];
            const lu = lastUsed.has(page) ? lastUsed.get(page) : -Infinity;
            if (lu < minTime) { minTime = lu; vicIdx = i; }
          }
          victim = mem[vicIdx];
          lastUsed.delete(victim);
          mem[vicIdx] = p;
          lastUsed.set(p, t);
        }
      }
      state.push({ ref: p, hit, victim, frames: clone(mem) });
    }
    return { faults, state };
  }

  function simulateOptimal(refs, frames) {
    const state = [];
    let faults = 0;
    const mem = emptyFrames(frames);

    const nextUseIndex = (page, start) => {
      for (let i = start; i < refs.length; i++) if (refs[i] === page) return i;
      return Infinity;
    };

    for (let t = 0; t < refs.length; t++) {
      const p = refs[t];
      let hit = false, victim = null;

      const idx = mem.indexOf(p);
      if (idx !== -1) {
        hit = true;
      } else {
        faults++;
        const empty = mem.indexOf(null);
        if (empty !== -1) {
          mem[empty] = p;
        } else {
          let farthest = -1, vicIdx = 0;
          for (let i = 0; i < mem.length; i++) {
            const nx = nextUseIndex(mem[i], t + 1);
            if (nx > farthest) { farthest = nx; vicIdx = i; }
          }
          victim = mem[vicIdx];
          mem[vicIdx] = p;
        }
      }
      state.push({ ref: p, hit, victim, frames: clone(mem) });
    }
    return { faults, state };
  }

  // ---------- Rendering ----------
  function renderStepsTable(result, frames) {
    const card = el("div", { className: "card" });
    const { algo, state } = result;

    card.appendChild(el("h4", { className: "m0" }, `${algo} — Step-by-step`));
    const wrap = el("div", { className: "table-wrap" });
    const table = el("table");

    // Row 0: time indexes
    const trIdx = el("tr");
    trIdx.appendChild(th("#/t"));
    state.forEach((_, i) => trIdx.appendChild(th(String(i))));
    table.appendChild(trIdx);

    // Row 1: page refs
    const trRef = el("tr");
    trRef.appendChild(th("Ref"));
    state.forEach(s => trRef.appendChild(th(String(s.ref))));
    table.appendChild(trRef);

    // Frame rows
    for (let f = 0; f < frames; f++) {
      const tr = el("tr");
      tr.appendChild(th(`Frame ${f + 1}`));
      let prev;
      state.forEach(s => {
        const td = el("td");
        const val = s.frames[f];
        td.textContent = (val === null || val === undefined) ? "" : String(val);
        if (prev !== val) td.style.fontWeight = "700";
        prev = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    }

    // Hit/Fault row
    const trHF = el("tr");
    trHF.appendChild(th("Hit/Fault"));
    state.forEach(s => {
      const td = el("td");
      if (s.hit) {
        td.textContent = "H"; td.className = "hit"; td.style.color = "var(--success)"; td.style.fontWeight = "800";
      } else {
        td.textContent = "F"; td.className = "miss"; td.style.color = "var(--danger)"; td.style.fontWeight = "800";
      }
      trHF.appendChild(td);
    });
    table.appendChild(trHF);

    wrap.appendChild(table);
    card.appendChild(wrap);
    return card;

    function th(text) {
      const h = el("th"); h.textContent = text; return h;
    }
  }

  function runSimulation() {
    const refs = parseRefs(refsEl.value || "");
    const frames = Math.max(1, Math.min(50, parseInt(framesEl.value || "0", 10)));

    if (!refs.length) {
      msgEl.textContent = "Please enter a reference string (numbers separated by spaces/commas).";
      resEl.innerHTML = ""; stepsEl.innerHTML = ""; return;
    }
    msgEl.textContent = `Parsed ${refs.length} references • Frames = ${frames}`;

    const selected = [
      { id: "alg-fifo", name: "FIFO", fn: simulateFIFO },
      { id: "alg-lru",  name: "LRU",  fn: simulateLRU },
      { id: "alg-opt",  name: "Optimal", fn: simulateOptimal },
    ].filter(a => qs("#" + a.id).checked);

    if (!selected.length) {
      resEl.innerHTML = ""; stepsEl.innerHTML = ""; msgEl.textContent = "Select at least one algorithm.";
      return;
    }

    const results = selected.map(algo => ({ algo: algo.name, ...algo.fn(refs, frames) }));

    // Metrics
    resEl.innerHTML = "";
    const maxFaults = Math.max(...results.map(r => r.faults));
    results.forEach(r => resEl.appendChild(
      metricCard(`${r.algo} — Page Faults`, r.faults, maxFaults ? r.faults / maxFaults : 1)
    ));

    // Steps
    stepsEl.innerHTML = "";
    results.forEach(r => stepsEl.appendChild(renderStepsTable(r, frames)));

    // Persist
    localStorage.setItem("paging.refs", refsEl.value);
    localStorage.setItem("paging.frames", String(frames));
  }

  function generateRandom() {
    const len = 12 + Math.floor(Math.random() * 10); // 12..21
    const range = 10; // 0..9
    const arr = Array.from({ length: len }, () => Math.floor(Math.random() * range));
    refsEl.value = arr.join(" ");
    framesEl.value = 2 + Math.floor(Math.random() * 6); // 2..7
    msgEl.textContent = "Random sequence generated • press Run Simulation";
  }

  // ---------- Events ----------
  runBtn.addEventListener("click", runSimulation);
  randBtn.addEventListener("click", generateRandom);
  clearBtn.addEventListener("click", () => {
    refsEl.value = ""; framesEl.value = "3";
    resEl.innerHTML = ""; stepsEl.innerHTML = ""; msgEl.textContent = "Cleared. Paste or generate a sequence, set frames, then Run.";
  });

  // ---------- Bootstrap from storage + first run ----------
  const savedRefs = localStorage.getItem("paging.refs");
  const savedFrames = localStorage.getItem("paging.frames");
  if (savedRefs) refsEl.value = savedRefs;
  if (savedFrames) framesEl.value = savedFrames;
  runSimulation();
})();
