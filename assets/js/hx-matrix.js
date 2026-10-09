/* =========================================================
 * HX_Dashboard hx-matrix.js — 组合矩阵渲染器（V9 核心组件移植）
 * 依赖：hx-data.js、hx-ui.js、hx-role.js
 * 能力：维度链自由配置（chip 增删，≤5 层）+ 预设保存（localStorage ≤3）
 *       + 同级分位四色底 + 表头多列叠加排序（N层，↑1/↓2优先级） + 折叠 + 点行/点格点击回调
 * ========================================================= */

const HXM = (() => {

    const MAX_CHAIN = 5;

    // ---------- 矩阵状态 ----------
    const state = {
        collapsed: new Set(),   // 节点 id
        sortStack: [],          // [{key, dir:'asc'|'desc'}] 叠加排序：先点的主排序，N 层无上限
    };

    // ---------- 建树（带父链与 id） ----------
    function buildTree(units, dims) {
        function build(list, depth, parentId, path) {
            if (depth >= dims.length) return [];
            const key = dims[depth];
            const map = {};
            list.forEach(u => {
                const v = HXD.dimValue(u, key);
                (map[v] || (map[v] = [])).push(u);
            });
            const nodes = Object.keys(map).map(name => {
                const id = parentId + '/' + name;
                const np = path.concat(name);
                return {
                    id, name, path: np, dimKey: key, dimName: HXD.DIMENSIONS.find(d => d.key === key).name,
                    depth, units: map[name], children: build(map[name], depth + 1, id, np),
                };
            });
            return nodes;
        }
        return build(units, 0, '', []);
    }

    // ---------- 排序比较（用 agg 缓存；叠加排序依 sortStack 顺序多级比较） ----------
    function sortSiblings(nodes) {
        if (!state.sortStack.length) {
            return nodes.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        }
        const levels = state.sortStack.map(s => ({
            m: HXD.METRICS[s.key], dir: s.dir === 'asc' ? 1 : -1,
        }));
        return nodes.slice().sort((a, b) => {
            for (const { m, dir } of levels) {
                const va = m.num(a._aggCache), vb = m.num(b._aggCache);
                const an = va == null || isNaN(va), bn = vb == null || isNaN(vb);
                if (an && bn) continue;
                if (an) return 1;           // 空值恒排最后
                if (bn) return -1;
                if (va !== vb) return (va - vb) * dir;
            }
            return a.name.localeCompare(b.name, 'zh-CN');
        });
    }

    // ---------- 表头排序按钮（↑N/↓N 优先级序号） ----------
    function sortHeaderHtml(key, metrics) {
        const m = HXD.METRICS[key];
        const i = state.sortStack.findIndex(s => s.key === key);
        const mark = i < 0 ? '⇅' : (state.sortStack[i].dir === 'asc' ? '↑' : '↓') + (i + 1);
        return `<button data-mx-sort="${key}" class="inline-flex items-center gap-1 font-medium hover:text-brand-600 transition-colors">
            <span style="color:${m.color}">${m.name}</span><span class="text-[10px] ${i < 0 ? 'text-slate-300' : 'text-brand-600'}">${mark}</span>
        </button>`;
    }
    function handleSort(key) {
        // 三态循环：不在栈→升序；升序→降序；降序→移除（其余层级保持）
        const i = state.sortStack.findIndex(s => s.key === key);
        if (i < 0) state.sortStack.push({ key, dir: 'asc' });
        else if (state.sortStack[i].dir === 'asc') state.sortStack[i].dir = 'desc';
        else state.sortStack.splice(i, 1);
    }

    // ---------- 主渲染 ----------
    // cfg: {mount, units, dims, metrics, opt, moduleId, onNodeClick, title, note}
    function render(cfg) {
        const mount = typeof cfg.mount === 'string' ? document.getElementById(cfg.mount) : cfg.mount;
        if (!mount) return;
        const units = cfg.units || [];
        const dims = cfg.dims, metrics = cfg.metrics, opt = cfg.opt || {};

        // 可加维度（excludeDims：页面级排除，如老带新页排除「新老生」）
        const remaining = HXD.DIMENSIONS.filter(d => !dims.includes(d.key) && !(cfg.excludeDims || []).includes(d.key));
        // 保存的预设
        const chains = HXD.loadChains();

        // 流程：建树 → 打兄弟标记 → 预计算全部节点 agg（缓存）→ 逐级排序 → 收集可见行
        const root = buildTree(units, dims);
        (function tagSiblings(nodes) {
            nodes.forEach(n => { n._siblings = nodes; tagSiblings(n.children); });
        })(root);
        (function precomputeAll(nodes) {
            nodes.forEach(n => { n._aggCache = HXD.agg(n.units, opt); precomputeAll(n.children); });
        })(root);

        const rows = [];
        (function walk(nodes) {
            const sorted = sortSiblings(nodes);
            sorted.forEach(n => {
                rows.push(n);
                if (!state.collapsed.has(n.id) && n.children.length) walk(n.children);
            });
        })(root);

        mount.innerHTML = `
        <div class="bg-white rounded-2xl border border-hxline shadow-card">
            <!-- 标题 + 维度链 -->
            <div class="px-5 pt-4 pb-3 border-b border-hxline-light">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <h2 class="text-[16px] font-bold text-ink">${cfg.title || '组合矩阵'}</h2>
                    ${cfg.noScope ? (cfg.headExtra || '') : HX_ROLE.scopeControlHtml(cfg.moduleId || 'matrix')}
                </div>
                <div class="flex items-center gap-2 flex-wrap mt-2.5">
                    ${dims.map((d, i) => {
            const dn = HXD.DIMENSIONS.find(x => x.key === d).name;
            return `${i > 0 ? '<span class="text-slate-300 text-xs">→</span>' : ''}
                            <span class="hx-dim-chip">${dn}<button data-mx-dim-move="${d}" data-dir="-1" title="左移" ${i === 0 ? 'disabled' : ''}>‹</button><button data-mx-dim-move="${d}" data-dir="1" title="右移" ${i === dims.length - 1 ? 'disabled' : ''}>›</button>${dims.length > 1 ? `<button data-mx-dim-remove="${d}" title="移除此维度">×</button>` : ''}</span>`;
        }).join('')}
                    ${dims.length < MAX_CHAIN && remaining.length ? `
                        <div class="relative inline-block">
                            <button data-mx-dim-add class="text-[12px] text-brand-600 border border-brand-200 rounded-md px-2 py-1 hover:bg-brand-50">＋ 维度</button>
                            <div data-mx-dim-menu class="hidden absolute left-0 mt-1 w-36 bg-white border border-hxline rounded-xl shadow-pop py-1 z-30">
                                ${remaining.map(d => `<button data-mx-dim-add-key="${d.key}" class="block w-full text-left px-3 py-1.5 text-[12px] text-sub hover:bg-brand-50 hover:text-brand-600">${d.name}</button>`).join('')}
                            </div>
                        </div>` : ''}
                    ${cfg.presets && cfg.presets.length ? `
                    <span class="text-slate-200 mx-0.5">|</span>
                    <span class="text-[11px] text-muted">快捷组合</span>
                    ${cfg.presets.map(p => {
            const active = p.dims.join(',') === dims.join(',');
            return `<button data-mx-preset="${p.dims.join(',')}" class="text-[12px] px-2.5 py-1 rounded-md border transition-colors ${active ? 'border-brand-300 bg-brand-50 text-brand-600 font-medium' : 'border-hxline text-sub hover:border-brand-200 hover:text-brand-600'}">${p.name}</button>`;
        }).join('')}` : ''}
                    <span class="text-slate-200">|</span>
                    <div class="flex items-center gap-1.5">
                        <input id="mx-chain-name" placeholder="预设名" class="border border-hxline rounded-md px-2 py-1 text-[12px] w-20 bg-white">
                        <button data-mx-chain-save class="text-[12px] text-muted hover:text-brand-600 border border-hxline rounded-md px-2 py-1">保存链</button>
                        ${chains.map(c => `<span class="inline-flex items-center border border-brand-200 bg-brand-50 rounded-md text-[12px] overflow-hidden">
                            <button data-mx-chain-load="${c.name}" class="px-2 py-1 text-brand-600" title="${c.dims.join('×')}">${c.name}</button>
                            <button data-mx-chain-del="${c.name}" class="px-1.5 py-1 text-slate-400 hover:text-rose-500 border-l border-brand-200">×</button>
                        </span>`).join('')}
                    </div>
                </div>
                ${(cfg.hideLegend || cfg.note || cfg.legendNoTitle) ? `<div class="flex items-center justify-between flex-wrap gap-2 mt-2.5">
                    ${cfg.hideLegend ? '' : HXUI.quotaLegend({ noTitle: cfg.legendNoTitle })}
                    <span class="text-[11px] text-muted">${cfg.note || ''}</span>
                </div>` : ''}
            </div>
            <!-- 表格 -->
            <div class="overflow-x-auto">
            <table class="w-full text-[13px] hx-matrix-table">
                <thead><tr class="border-b border-hxline">
                    <th class="px-4 py-2.5 text-left font-medium text-muted w-[26%]">组合路径</th>
                    ${metrics.map(k => `<th class="px-3 py-2.5 text-center">${sortHeaderHtml(k, metrics)}</th>`).join('')}
                </tr></thead>
                <tbody id="mx-body"></tbody>
            </table>
            </div>
        </div>`;

        // 渲染行（agg 已预计算于 _aggCache）
        const body = mount.querySelector('#mx-body');
        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="${metrics.length + 1}" class="py-12 text-center text-muted">当前筛选范围暂无数据</td></tr>`;
        } else {
            body.innerHTML = rows.map(node => rowHtml(node, metrics, opt, cfg)).join('');
        }

        // —— 绑定事件 ——
        mount.querySelectorAll('[data-mx-toggle]').forEach(b => {
            b.onclick = e => {
                e.stopPropagation();
                const id = b.dataset.mxToggle;
                state.collapsed.has(id) ? state.collapsed.delete(id) : state.collapsed.add(id);
                render(cfg);
            };
        });
        mount.querySelectorAll('[data-mx-dim-remove]').forEach(b => {
            b.onclick = e => { e.stopPropagation(); cfg.onDimsChange && cfg.onDimsChange(dims.filter(d => d !== b.dataset.mxDimRemove)); };
        });
        mount.querySelectorAll('[data-mx-dim-move]').forEach(b => {
            b.onclick = e => {
                e.stopPropagation();
                const i = dims.indexOf(b.dataset.mxDimMove);
                const j = i + (+b.dataset.dir);
                if (i < 0 || j < 0 || j >= dims.length) return;
                const copy = dims.slice();
                copy[i] = dims[j]; copy[j] = dims[i];
                cfg.onDimsChange && cfg.onDimsChange(copy);
            };
        });
        mount.querySelectorAll('[data-mx-preset]').forEach(b => {
            b.onclick = e => { e.stopPropagation(); cfg.onDimsChange && cfg.onDimsChange(b.dataset.mxPreset.split(',')); };
        });
        const addBtn = mount.querySelector('[data-mx-dim-add]');
        if (addBtn) addBtn.onclick = e => {
            e.stopPropagation();
            mount.querySelector('[data-mx-dim-menu]').classList.toggle('hidden');
        };
        mount.querySelectorAll('[data-mx-dim-add-key]').forEach(b => {
            b.onclick = e => {
                e.stopPropagation();
                cfg.onDimsChange && cfg.onDimsChange(dims.concat([b.dataset.mxDimAddKey]));
            };
        });
        const saveBtn = mount.querySelector('[data-mx-chain-save]');
        if (saveBtn) saveBtn.onclick = () => {
            const name = mount.querySelector('#mx-chain-name').value.trim();
            if (!name) return HXUI.toast('请输入预设名');
            HXD.saveChain(name, dims);
            HXUI.toast('已保存维度链「' + name + '」');
            render(cfg);
        };
        mount.querySelectorAll('[data-mx-chain-load]').forEach(b => {
            b.onclick = () => {
                const c = HXD.loadChains().find(x => x.name === b.dataset.mxChainLoad);
                if (c) cfg.onDimsChange && cfg.onDimsChange(c.dims);
            };
        });
        mount.querySelectorAll('[data-mx-chain-del]').forEach(b => {
            b.onclick = () => { HXD.deleteChain(b.dataset.mxChainDel); render(cfg); };
        });
        mount.querySelectorAll('[data-mx-sort]').forEach(b => {
            b.onclick = e => { e.stopPropagation(); handleSort(b.dataset.mxSort); render(cfg); };
        });
        mount.querySelectorAll('[data-mx-cell]').forEach(el => {
            el.onclick = e => {
                e.stopPropagation();
                const id = el.dataset.mxCell;
                const node = findNode(root, id);
                cfg.onCellClick && cfg.onCellClick(node, el.dataset.mxMetric);
            };
        });
        mount.querySelectorAll('[data-mx-row]').forEach(tr => {
            tr.onclick = () => {
                const node = findNode(root, tr.dataset.mxRow);
                cfg.onNodeClick && cfg.onNodeClick(node);
            };
        });
    }

    // 行渲染
    function rowHtml(node, metrics, opt, cfg) {
        const a = node._aggCache;
        const collapsed = state.collapsed.has(node.id);
        const hasKids = node.children.length > 0;
        const badge = cfg.showOwned !== false ? HX_ROLE.ownedBadge(node.units) : '';
        return `
        <tr class="border-b border-hxline-light hover:bg-[#f8faff]" data-mx-row="${node.id}">
            <td class="px-4 py-2.5">
                <div class="flex items-center gap-1.5" style="padding-left:${node.depth * 18}px">
                    ${hasKids ? `<button data-mx-toggle="${node.id}" class="w-5 h-5 rounded-md border border-hxline text-[10px] text-muted hover:border-brand-400 hover:text-brand-600 flex items-center justify-center shrink-0">${collapsed ? '›' : '⌄'}</button>` : '<span class="w-5 h-0.5 bg-hxline rounded shrink-0"></span>'}
                    <div class="min-w-0">
                        <b class="text-ink text-[13px] whitespace-nowrap">${node.name}</b>${badge}
                        <small class="block text-[10px] text-muted truncate">${node.path.join(' / ')}</small>
                    </div>
                </div>
            </td>
            ${metrics.map(k => {
            const m = HXD.METRICS[k];
            const v = m.num(a);
            let lv = { level: 'normal', rank: null, count: 0 };
            if (node._siblings && node._siblings.length > 1) {
                const vals = node._siblings.map(sb => m.num(sb._aggCache));
                lv = HXD.rankLevel(vals, v, m.better);
            }
            return `<td class="px-2 py-1.5">
                <div class="hx-cell hx-cell-${lv.level} rounded-lg px-2 py-1.5 cursor-pointer" data-mx-cell="${node.id}" data-mx-metric="${k}" title="${m.formula || ''}">
                    <div class="hx-cell-top flex items-baseline justify-between">${HXUI.fmt(v, m.rate !== false)}</div>
                    <div class="hx-cell-bottom text-right">${HXD.positionText(lv.rank, lv.count)}</div>
                </div>
            </td>`;
        }).join('')}
        </tr>`;
    }
    function findNode(root, id) {
        for (const n of root) {
            if (n.id === id) return n;
            const f = findNode(n.children, id);
            if (f) return f;
        }
        return null;
    }

    // 模块级单次绑定：点击「＋维度」菜单外部关闭（替代每次 render 累积的匿名监听器，防泄漏）
    document.addEventListener('click', e => {
        if (!e.target.closest('[data-mx-dim-menu]') && !e.target.closest('[data-mx-dim-add]')) {
            document.querySelectorAll('[data-mx-dim-menu]').forEach(m => m.classList.add('hidden'));
        }
    });

    return { render, state, buildTree, handleSort };
})();
