/*
 * <placement-view>: grid view of the machines of the current plan (see layout.js for the model).
 * Buildings can be dragged and rotated; belts and pipes are routed again after every change.
 */
(function () {
  const { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } = Vue;
  const Layout = window.FactoryLayout;
  const CELL = 16;
  const STORAGE_KEY = "zmd-layout-v1";
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 4;

  const strings = {
    zh: {
      title: "设备摆放",
      show: "生成摆放",
      hide: "收起",
      empty: "当前方案没有需要摆放的设备。",
      auto: "自动排布",
      rotate: "旋转",
      fit: "适应窗口",
      save: "保存",
      load: "读取",
      exportFile: "导出",
      importFile: "导入",
      fullscreen: "全屏",
      exitFullscreen: "退出全屏",
      area: "占地",
      cells: "格",
      machines: "设备",
      belt: "传送带",
      pipe: "管道",
      crossings: "交叉",
      junctions: "分流/汇流",
      unrouted: "未连通",
      overloaded: "端口超载",
      partial: "方案过大，部分线路未计算。",
      hint: "拖动设备移动（原料入口/成品出口随设备一起移动，也可单独拖动）；选中后按 R 或点“旋转”；方向键微调；拖动空白处平移，滚轮缩放。红色虚线表示未能连通的线路。",
      saved: "布局已保存到本浏览器。",
      noSaved: "没有已保存的布局。",
      restored: (a, b) => `已恢复 ${a}/${b} 个建筑的位置。`,
      badFile: "无法识别的布局文件。",
      blocked: "目标位置被占用。",
      source: "原料入口",
      sink: "成品/副产物出口",
      legendBelt: "传送带",
      legendPipe: "管道",
      legendSource: "原料入口",
      legendSink: "出口",
      legendJunction: "分流器/汇流器",
      perMin: "/分钟"
    },
    en: {
      title: "Placement",
      show: "Generate layout",
      hide: "Hide",
      empty: "The current plan has no machines to place.",
      auto: "Auto arrange",
      rotate: "Rotate",
      fit: "Fit",
      save: "Save",
      load: "Load",
      exportFile: "Export",
      importFile: "Import",
      fullscreen: "Fullscreen",
      exitFullscreen: "Exit fullscreen",
      area: "Footprint",
      cells: "cells",
      machines: "Machines",
      belt: "Belts",
      pipe: "Pipes",
      crossings: "Crossings",
      junctions: "Splitters/mergers",
      unrouted: "Unconnected",
      overloaded: "Overloaded ports",
      partial: "The plan is too large; some links were not routed.",
      hint: "Drag a machine to move it (its depot markers follow, or drag them on their own). Select one and press R or click Rotate; arrow keys nudge. Drag the background to pan, scroll to zoom. Dashed red lines are links that could not be routed.",
      saved: "Layout saved in this browser.",
      noSaved: "No saved layout.",
      restored: (a, b) => `Restored ${a} of ${b} buildings.`,
      badFile: "Not a layout file.",
      blocked: "That spot is taken.",
      source: "Raw input",
      sink: "Output",
      legendBelt: "Belt",
      legendPipe: "Pipe",
      legendSource: "Raw input",
      legendSink: "Output",
      legendJunction: "Splitter / merger",
      perMin: "/min"
    }
  };

  const template = `
  <div class="placement" :class="{ fullscreen }">
    <div class="section-header placement-header">
      <h2>{{ s.title }}</h2>
      <div class="placement-actions">
        <template v-if="open && hasMachines">
          <button class="btn ghost" type="button" data-action="auto" @click="arrange">{{ s.auto }}</button>
          <button class="btn ghost" type="button" data-action="rotate" :disabled="!canRotate" @click="rotateSelected(1)">⟳ {{ s.rotate }}</button>
          <button class="icon-btn" type="button" @click="zoomBy(1 / 1.25)">-</button>
          <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
          <button class="icon-btn" type="button" @click="zoomBy(1.25)">+</button>
          <button class="btn ghost" type="button" @click="fit">{{ s.fit }}</button>
          <button class="btn ghost" type="button" data-action="save" @click="save">{{ s.save }}</button>
          <button class="btn ghost" type="button" data-action="load" @click="load">{{ s.load }}</button>
          <button class="btn ghost" type="button" data-action="export" @click="exportFile">{{ s.exportFile }}</button>
          <button class="btn ghost" type="button" data-action="import" @click="$refs.file.click()">{{ s.importFile }}</button>
          <input ref="file" type="file" accept="application/json,.json" hidden @change="importFile" />
          <button class="btn ghost" type="button" @click="toggleFullscreen">{{ fullscreen ? s.exitFullscreen : s.fullscreen }}</button>
        </template>
        <button class="btn" type="button" data-action="toggle" @click="toggle">{{ open ? s.hide : s.show }}</button>
      </div>
    </div>
    <template v-if="open">
      <div v-if="!hasMachines" class="empty">{{ s.empty }}</div>
      <template v-else>
        <div class="placement-stats">
          <span>{{ s.area }} <b>{{ stats.width }}×{{ stats.height }}</b> {{ s.cells }}</span>
          <span>{{ s.machines }} <b>{{ stats.machines }}</b></span>
          <span><i class="swatch belt"></i>{{ s.belt }} <b>{{ stats.belt }}</b> {{ s.cells }}</span>
          <span><i class="swatch pipe"></i>{{ s.pipe }} <b>{{ stats.pipe }}</b> {{ s.cells }}</span>
          <span>{{ s.crossings }} <b>{{ stats.crossings }}</b></span>
          <span><i class="swatch junction"></i>{{ s.junctions }} <b>{{ stats.junctions }}</b></span>
          <span :class="{ warn: stats.unrouted > 0 }">{{ s.unrouted }} <b>{{ stats.unrouted }}</b></span>
          <span :class="{ warn: stats.overloaded > 0 }">{{ s.overloaded }} <b>{{ stats.overloaded }}</b></span>
          <span><i class="swatch source"></i>{{ s.legendSource }}</span>
          <span><i class="swatch sink"></i>{{ s.legendSink }}</span>
        </div>
        <div v-if="stats.partial" class="placement-message warn">{{ s.partial }}</div>
        <div class="placement-message">{{ message }}</div>
        <div
          class="placement-canvas"
          ref="canvas"
          tabindex="0"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKey"
        >
          <svg width="100%" height="100%">
            <defs>
              <pattern id="placement-grid" :width="CELL" :height="CELL" patternUnits="userSpaceOnUse">
                <path :d="'M ' + CELL + ' 0 L 0 0 0 ' + CELL" fill="none" class="grid-line" />
              </pattern>
            </defs>
            <g :transform="'translate(' + pan.x + ' ' + pan.y + ') scale(' + zoom + ')'">
              <rect :x="view.grid.x" :y="view.grid.y" :width="view.grid.w" :height="view.grid.h" fill="url(#placement-grid)" />
              <g
                v-for="b in view.buildings"
                :key="b.id"
                class="building"
                :class="[b.kind, { selected: b.id === selectedId, invalid: b.invalid }]"
                :data-key="b.key"
                :transform="'translate(' + b.px + ' ' + b.py + ')'"
                @pointerdown="onBuildingDown(b.id, $event)"
              >
                <title>{{ b.title }}</title>
                <rect class="body" :width="b.pw" :height="b.ph" :rx="b.kind === 'machine' ? 3 : 5" />
                <template v-if="b.kind === 'machine'">
                  <text class="name" :x="b.pw / 2" :y="b.ph / 2 - 2">{{ b.name }}</text>
                  <text class="item" :x="b.pw / 2" :y="b.ph / 2 + 9">{{ b.item }}</text>
                  <polygon v-for="(port, index) in b.ports" :key="index" class="port" :class="[port.type, port.io]" :points="port.points" />
                </template>
              </g>
              <g class="routes" :class="{ dragging: !!drag && drag.moved }">
                <polyline
                  v-for="r in view.routes"
                  :key="r.id"
                  class="route"
                  :class="[r.type, { failed: !r.ok, active: r.active }]"
                  :points="r.points"
                ><title>{{ r.title }}</title></polyline>
                <rect
                  v-for="(j, index) in view.junctions"
                  :key="'j' + index"
                  class="junction"
                  :class="j.type"
                  :x="j.x"
                  :y="j.y"
                  :width="CELL - 6"
                  :height="CELL - 6"
                />
              </g>
            </g>
          </svg>
        </div>
        <p class="placement-hint">{{ s.hint }}</p>
      </template>
    </template>
  </div>`;

  window.PlacementView = {
    name: "PlacementView",
    props: {
      runs: { type: Array, default: () => [] },
      itemMap: { type: Object, default: () => ({}) },
      machineMap: { type: Object, default: () => ({}) },
      logistics: { type: Object, default: () => ({}) },
      lang: { type: String, default: "zh" },
      itemName: { type: Function, default: (id) => id },
      machineName: { type: Function, default: (id) => id }
    },
    template,
    setup(props) {
      const open = ref(false);
      const fullscreen = ref(false);
      const plan = shallowRef(null);
      const routed = shallowRef(null);
      const revision = ref(0);
      const selectedId = ref("");
      const zoom = ref(1);
      const pan = ref({ x: 0, y: 0 });
      const message = ref("");
      const canvas = ref(null);
      const drag = ref(null);
      const s = computed(() => strings[props.lang] || strings.zh);

      const hasMachines = computed(() => !!plan.value && plan.value.buildings.some((b) => b.kind === "machine"));
      const emptyStats = { width: 0, height: 0, machines: 0, belt: 0, pipe: 0, crossings: 0, junctions: 0, unrouted: 0, overloaded: 0 };
      const stats = computed(() => (routed.value ? routed.value.stats : emptyStats));
      const selected = computed(() => {
        revision.value;
        return plan.value ? plan.value.buildings.find((b) => b.id === selectedId.value) || null : null;
      });
      const canRotate = computed(() => !!selected.value && selected.value.kind === "machine");

      function reroute() {
        routed.value = plan.value ? Layout.route(plan.value) : null;
        revision.value += 1;
      }

      const machineKeys = (target) => target.buildings.filter((b) => b.kind === "machine").map((b) => b.key);

      function build(keep) {
        const previous = keep && plan.value ? Layout.serialize(plan.value) : null;
        const previousKeys = previous ? new Set(machineKeys(plan.value)) : null;
        const next = Layout.buildPlan({
          runs: props.runs,
          itemMap: props.itemMap,
          machineMap: props.machineMap,
          logistics: props.logistics
        });
        Layout.autoArrange(next);
        if (previous) {
          // Same machines as before (depot markers may differ): keep the user's positions and rotations.
          const keys = machineKeys(next);
          if (keys.length === previousKeys.size && keys.every((key) => previousKeys.has(key))) Layout.applySaved(next, previous);
        }
        plan.value = next;
        selectedId.value = "";
        reroute();
        nextTick(fit);
      }

      function toggle() {
        open.value = !open.value;
        message.value = "";
        // The plan is kept while hidden, so reopening restores manual edits when the machines are unchanged.
        if (open.value) build(true);
        else fullscreen.value = false;
      }

      watch(
        () => props.runs,
        () => {
          if (open.value) build(true);
        }
      );

      function arrange() {
        if (!plan.value) return;
        Layout.autoArrange(plan.value);
        message.value = "";
        reroute();
        nextTick(fit);
      }

      function fit() {
        const el = canvas.value;
        if (!el || !routed.value) return;
        const { x, y, w, h } = routed.value.bounds;
        const pad = 3;
        const width = (w + pad * 2) * CELL;
        const height = (h + pad * 2) * CELL;
        const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(el.clientWidth / width, el.clientHeight / height, 1.5)));
        zoom.value = scale;
        pan.value = {
          x: (el.clientWidth - width * scale) / 2 - (x - pad) * CELL * scale,
          y: (el.clientHeight - height * scale) / 2 - (y - pad) * CELL * scale
        };
      }

      function zoomAt(factor, cx, cy) {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value * factor));
        const ratio = next / zoom.value;
        pan.value = { x: cx - (cx - pan.value.x) * ratio, y: cy - (cy - pan.value.y) * ratio };
        zoom.value = next;
      }

      function zoomBy(factor) {
        const el = canvas.value;
        if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
      }

      function onWheel(event) {
        const rect = canvas.value.getBoundingClientRect();
        zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
      }

      function onBuildingDown(id, event) {
        if (event.button !== 0 || !plan.value) return;
        event.stopPropagation();
        const building = plan.value.buildings.find((b) => b.id === id);
        selectedId.value = id;
        message.value = "";
        const group = Layout.groupOf(plan.value, building);
        drag.value = {
          kind: "building",
          building,
          group,
          origin: group.map((member) => [member.x, member.y]),
          startX: event.clientX,
          startY: event.clientY,
          dx: 0,
          dy: 0,
          moved: false,
          invalid: false
        };
        canvas.value.setPointerCapture(event.pointerId);
        canvas.value.focus({ preventScroll: true });
      }

      function onPointerDown(event) {
        if (event.button !== 0) return;
        drag.value = { kind: "pan", startX: event.clientX, startY: event.clientY, pan: { ...pan.value }, moved: false };
        canvas.value.setPointerCapture(event.pointerId);
        canvas.value.focus({ preventScroll: true });
      }

      function onPointerMove(event) {
        const state = drag.value;
        if (!state) return;
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (state.kind === "pan") {
          if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
          pan.value = { x: state.pan.x + dx, y: state.pan.y + dy };
          return;
        }
        const cx = Math.round(dx / (CELL * zoom.value));
        const cy = Math.round(dy / (CELL * zoom.value));
        if (cx === state.dx && cy === state.dy) return;
        state.dx = cx;
        state.dy = cy;
        state.moved = true;
        const ignore = new Set(state.group.map((member) => member.id));
        state.group.forEach((member, index) => {
          member.x = state.origin[index][0] + cx;
          member.y = state.origin[index][1] + cy;
        });
        state.invalid = state.group.some((member) => Layout.collides(plan.value, member, member.x, member.y, member.rot, ignore));
        revision.value += 1;
      }

      function onPointerUp(event) {
        const state = drag.value;
        if (!state) return;
        drag.value = null;
        if (canvas.value && canvas.value.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId);
        if (state.kind === "pan") {
          if (!state.moved) selectedId.value = "";
          return;
        }
        if (!state.moved) return;
        if (state.invalid) {
          state.group.forEach((member, index) => {
            [member.x, member.y] = state.origin[index];
          });
          message.value = s.value.blocked;
          revision.value += 1;
          return;
        }
        if (state.dx || state.dy) reroute();
      }

      function rotateSelected(turns) {
        if (!canRotate.value) return;
        if (Layout.rotate(plan.value, selected.value, turns)) {
          message.value = "";
          reroute();
        } else {
          message.value = s.value.blocked;
        }
      }

      function nudge(dx, dy) {
        if (!selected.value) return;
        if (Layout.move(plan.value, selected.value, dx, dy)) {
          message.value = "";
          reroute();
        } else {
          message.value = s.value.blocked;
        }
      }

      function onKey(event) {
        // Leave browser shortcuts such as Ctrl+R alone.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (event.key === "r" || event.key === "R") rotateSelected(event.shiftKey ? -1 : 1);
        else if (arrows[event.key]) nudge(...arrows[event.key]);
        else if (event.key === "Escape") {
          if (fullscreen.value) toggleFullscreen();
          else selectedId.value = "";
        } else return;
        event.preventDefault();
      }

      function toggleFullscreen() {
        fullscreen.value = !fullscreen.value;
      }

      // Esc leaves fullscreen wherever the focus is (it is on the toolbar button right after entering).
      function onWindowKey(event) {
        if (event.key === "Escape" && fullscreen.value) fullscreen.value = false;
      }

      // A status message is written in the language it was shown in; drop it rather than leave it untranslated.
      watch(
        () => props.lang,
        () => (message.value = "")
      );

      watch(fullscreen, (on) => {
        document.body.classList.toggle("placement-fullscreen", on);
        window[on ? "addEventListener" : "removeEventListener"]("keydown", onWindowKey);
        nextTick(fit);
      });

      function restore(saved) {
        const result = saved && plan.value ? Layout.applySaved(plan.value, saved) : null;
        if (!result) return false;
        message.value = s.value.restored(result.matched, result.total);
        reroute();
        nextTick(fit);
        return true;
      }

      function save() {
        if (!plan.value) return;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(Layout.serialize(plan.value)));
          message.value = s.value.saved;
        } catch (error) {
          message.value = String(error);
        }
      }

      function load() {
        let saved = null;
        try {
          saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        } catch (error) {
          saved = null;
        }
        if (!restore(saved)) message.value = s.value.noSaved;
      }

      function exportFile() {
        if (!plan.value) return;
        const blob = new Blob([JSON.stringify(Layout.serialize(plan.value), null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "zmd-layout.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }

      function importFile(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        file
          .text()
          .then((text) => {
            if (!restore(JSON.parse(text))) message.value = s.value.badFile;
          })
          .catch(() => {
            message.value = s.value.badFile;
          });
      }

      const shorten = (text, width) => {
        const wide = /[^\x00-\xff]/.test(text);
        const max = Math.max(2, Math.floor(width / (wide ? 8.5 : 4.6)));
        return text.length > max ? text.slice(0, max - 1) + "…" : text;
      };
      const perMinute = (rate) => `${Math.round(rate * 6000) / 100}${s.value.perMin}`;

      const view = computed(() => {
        revision.value;
        const current = plan.value;
        const result = routed.value;
        if (!current || !result) return { buildings: [], routes: [], junctions: [], grid: { x: 0, y: 0, w: 0, h: 0 } };
        const state = drag.value;
        const dragged = state && state.kind === "building" && state.invalid ? new Set(state.group.map((m) => m.id)) : null;
        const clashing = Layout.overlapping(current); // e.g. from an imported file
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const buildings = current.buildings
          .filter((b) => b.x !== null)
          .map((b) => {
            const rect = Layout.rectOf(b);
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.w);
            maxY = Math.max(maxY, rect.y + rect.h);
            const entry = {
              id: b.id,
              key: b.key,
              kind: b.kind,
              px: rect.x * CELL,
              py: rect.y * CELL,
              pw: rect.w * CELL,
              ph: rect.h * CELL,
              invalid: clashing.has(b.id) || (!!dragged && dragged.has(b.id))
            };
            if (b.kind !== "machine") {
              entry.title = `${b.kind === "source" ? s.value.source : s.value.sink}: ${props.itemName(b.itemId)}`;
              return entry;
            }
            const machine = props.machineName(b.machineId);
            const item = props.itemName(b.itemId);
            entry.name = shorten(machine, entry.pw - 4);
            entry.item = shorten(item, entry.pw - 4);
            entry.title = `${machine} #${b.index}/${b.total} - ${item}`;
            entry.ports = Layout.worldPorts(b).map((port) => {
              const [dx, dy] = Layout.DIRS[port.d];
              const shift = port.io === "in" ? -0.28 : 0.28;
              const cx = (port.x - rect.x + 0.5 + dx * shift) * CELL;
              const cy = (port.y - rect.y + 0.5 + dy * shift) * CELL;
              const tip = [cx + dx * 3.5, cy + dy * 3.5];
              const left = [cx - dx * 2.5 - dy * 3.5, cy - dy * 2.5 + dx * 3.5];
              const right = [cx - dx * 2.5 + dy * 3.5, cy - dy * 2.5 - dx * 3.5];
              return { type: port.type, io: port.io, points: [tip, left, right].map((p) => p.join(",")).join(" ") };
            });
            return entry;
          });
        const byId = {};
        current.buildings.forEach((b) => (byId[b.id] = b));
        const centre = (b) => {
          const rect = Layout.rectOf(b);
          return [rect.x + rect.w / 2, rect.y + rect.h / 2];
        };
        const routes = result.routes.map((r, index) => {
          const link = current.links[index];
          const points = r.ok ? r.points.map(([x, y]) => [x + 0.5, y + 0.5]) : [centre(byId[link.from]), centre(byId[link.to])];
          return {
            id: r.linkId,
            ok: r.ok,
            type: r.type,
            active: !!selectedId.value && (link.from === selectedId.value || link.to === selectedId.value),
            points: points.map(([x, y]) => `${x * CELL},${y * CELL}`).join(" "),
            title: `${props.itemName(link.itemId)} ${perMinute(link.rate)}`
          };
        });
        const junctions = result.junctions.map((j) => ({ type: j.type, x: j.x * CELL + 3, y: j.y * CELL + 3 }));
        const pad = 40;
        return {
          buildings,
          routes,
          junctions,
          grid: { x: (minX - pad) * CELL, y: (minY - pad) * CELL, w: (maxX - minX + 2 * pad) * CELL, h: (maxY - minY + 2 * pad) * CELL }
        };
      });

      onBeforeUnmount(() => {
        drag.value = null;
        document.body.classList.remove("placement-fullscreen");
        window.removeEventListener("keydown", onWindowKey);
      });

      return {
        CELL,
        s,
        open,
        fullscreen,
        hasMachines,
        stats,
        view,
        zoom,
        pan,
        message,
        canvas,
        drag,
        selectedId,
        canRotate,
        toggle,
        arrange,
        fit,
        zoomBy,
        onWheel,
        onBuildingDown,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onKey,
        rotateSelected,
        toggleFullscreen,
        save,
        load,
        exportFile,
        importFile
      };
    }
  };
})();
