/* =========================================================
 * HX_Dashboard hx-ui.js — v2 公共 UI 组件库
 * 依赖：hx-data.js（HXD）、hx-role.js（HX_ROLE）、Tailwind、ECharts（页面自引）
 * 组件：KPI行 / 窗口选择器（讲次轴+日轴+阶段轴） / query-first 筛选条
 *       栈式抽屉 / 分位图例 / finder / 自定义对比抽屉 / toast
 * ========================================================= */

const HXUI = (() => {

    const fmt = (v, rate) => {
        if (v == null) return '—';
        return rate ? v.toFixed(1) + '%' : String(Math.round(v));
    };

    // ---------- toast ----------
    let _toastTimer = null;
    function toast(msg) {
        let el = document.getElementById('hx-toast');
        if (!el) { el = document.createElement('div'); el.id = 'hx-toast'; el.className = 'hx-toast'; document.body.appendChild(el); }
        el.textContent = msg;
        el.style.display = 'block';
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
    }

    // ---------- KPI 行（含口径悬浮） ----------
    // cards: [{metricKey, value, sub, delta, onClick(可选：点击卡片回调)}]
    // 坑：回调若为闭包（引用 render 局部变量），内联字符串化会在全局作用域求值导致闭包失效，
    // 故走注册表：onclick=HXUI.kpiClick(id) 反查真实回调。
    const _kpiHandlers = {};
    let _kpiSeq = 0;
    function kpiClick(id) { const fn = _kpiHandlers[id]; if (fn) fn(); }
    function kpiRow(cards) {
        return `<div class="grid gap-3 mb-4" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">
            ${cards.map(c => {
            const m = HXD.METRICS[c.metricKey] || {};
            let clickAttr = '';
            if (c.onClick) { const nid = 'kpi' + (++_kpiSeq); _kpiHandlers[nid] = c.onClick; clickAttr = ` onclick="HXUI.kpiClick('${nid}')"`; }
            return `
            <div class="bg-white rounded-2xl border border-hxline px-4 py-3 shadow-card${c.onClick ? ' cursor-pointer hover:border-brand-300 transition-colors' : ''}"${clickAttr} title="${c.label ? (c.tip || '') : (m.formula || '')}">
                <div class="flex items-center gap-1.5 text-[12px] text-muted">
                    <span class="w-1.5 h-1.5 rounded-full" style="background:${c.color || m.color || '#2f6fed'}"></span>
                    ${c.label || m.name || ''}
                    <svg class="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
                </div>
                <div class="flex items-baseline gap-1 mt-1">
                    <span class="text-2xl font-bold tabular-nums text-[#163563] ${c.valueClass || ''}">${fmt(c.value, c.rate != null ? c.rate : m.rate !== false)}</span>
                </div>
                <div class="text-[11px] mt-0.5 text-muted">${c.sub || ''}</div>
            </div>`;
        }).join('')}
        </div>`;
    }

    // ---------- 窗口选择器 ----------
    // 讲次轴：全部 / 最近一讲 / 自选多讲
    function lectureWindowHtml(state, id) {
        id = id || 'hxLectureWin';
        const sel = state.lectureMode || 'all';
        return `<div class="flex items-center gap-2 text-[12px]" id="${id}">
            <span class="text-muted">讲次</span>
            <div class="flex items-center gap-1 p-0.5 bg-slate-100/70 rounded-lg">
                ${[['all', '全部'], ['latest', '最近一讲'], ['custom', '自选']].map(([k, l]) =>
            `<button data-lw="${k}" onclick="HXUI.setLectureWindow('${id}','${k}')" class="px-3 py-1 rounded-md text-[12px] font-medium transition-all ${sel === k ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">${l}</button>`).join('')}
            </div>
            ${sel === 'custom' ? `<button onclick="HXUI.openLecturePicker('${id}')" class="text-brand-600 text-[12px] underline">选择讲次（${(state.lectures || []).length}/16）</button>` : ''}
            ${sel === 'latest' ? '<span class="text-[11px] text-muted">仅第16讲</span>' : ''}
        </div>`;
    }
    function lectureSet(state) {
        const mode = state.lectureMode || 'all';
        if (mode === 'all') return null;
        if (mode === 'latest') return new Set([HXD.LECTURE_COUNT]);
        return new Set(state.lectures && state.lectures.length ? state.lectures : [HXD.LECTURE_COUNT]);
    }
    function setLectureWindow(id, mode) {
        const host = document.getElementById(id); if (!host) return;
        host.dispatchEvent(new CustomEvent('hx-window-change', { detail: { lectureMode: mode }, bubbles: true }));
    }
    function openLecturePicker(id) {
        const state = window.__hxPageState || {};
        const cur = new Set(state.lectures || []);
        HXUI.drawerPush('选择统计讲次（最多16讲）', `
            <div class="grid grid-cols-8 gap-2">
                ${Array.from({ length: HXD.LECTURE_COUNT }, (_, i) => `
                    <button data-lp="${i + 1}" class="py-2 rounded-lg border text-[13px] tabular-nums transition-all ${cur.has(i + 1) ? 'border-brand-500 bg-brand-50 text-brand-600 font-semibold' : 'border-hxline bg-white text-sub hover:border-brand-300'}">${i + 1}</button>`).join('')}
            </div>
            <div class="text-[11px] text-muted mt-3">讲次过滤所有聚合指标（到课/深参/提交/正确/笔记/差值）。</div>
        `, 'max-w-lg');
        document.querySelectorAll('[data-lp]').forEach(b => {
            b.onclick = () => {
                const v = +b.dataset.lp;
                const s = new Set(state.lectures || []);
                s.has(v) ? s.delete(v) : s.add(v);
                state.lectures = [...s];
                b.className = b.className.includes('brand-50') && s.has(v) === false
                    ? b.className.replace('border-brand-500 bg-brand-50 text-brand-600 font-semibold', 'border-hxline bg-white text-sub hover:border-brand-300')
                    : (s.has(v) ? 'py-2 rounded-lg border text-[13px] tabular-nums transition-all border-brand-500 bg-brand-50 text-brand-600 font-semibold' : b.className);
            };
        });
        // 应用按钮
        const apply = document.createElement('button');
        apply.className = 'mt-4 w-full py-2.5 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600';
        apply.textContent = '应用';
        apply.onclick = () => {
            HXUI.drawerPop();
            document.getElementById(id).dispatchEvent(new CustomEvent('hx-window-change', { detail: { lectures: state.lectures }, bubbles: true }));
        };
        document.querySelector('.hx-drawer-body').appendChild(apply);
    }

    // 日轴：今日 / 近7天 / 近30天 / 全部 / 自定义（起止日期区间）；dayAxis={dayCount,dayLabels} 可选（多学季页面传入，缺省用全局秋季轴）
    function dayWindowHtml(state, id, dayAxis) {
        id = id || 'hxDayWin';
        const sel = state.dayMode || '7d';
        const MAP = [['today', '今日'], ['7d', '近7天'], ['30d', '近30天'], ['all', '全部'], ['custom', '自定义']];
        const D = dayAxis ? dayAxis.dayCount : HXD.DAY_COUNT, LB = dayAxis ? dayAxis.dayLabels : HXD.DAY_LABELS;
        const cur = state.dayCustom || { from: D - 7, to: D - 1 };
        const dayOpts = key => Array.from({ length: D }, (_, i) => `<option value="${i}" ${cur[key] === i ? 'selected' : ''}>${LB[i]}</option>`).join('');
        return `<div class="flex items-center gap-2 text-[12px]" id="${id}">
            <span class="text-muted">时间</span>
            <div class="flex items-center gap-1 p-0.5 bg-slate-100/70 rounded-lg relative">
                ${MAP.map(([k, l]) => `<button data-dw="${k}" onclick="HXUI.setDayWindow('${id}','${k}')" class="px-3 py-1 rounded-md text-[12px] font-medium transition-all ${sel === k ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">${l}</button>`).join('')}
                <div data-dw-pop class="hidden absolute top-full right-0 mt-2 z-30 bg-white rounded-xl border border-hxline shadow-card p-3.5 w-72">
                    <div class="text-[12px] font-bold text-ink mb-2.5">自定义日期区间</div>
                    <div class="flex items-center gap-1.5 text-[12px]">
                        <span class="text-muted">起</span>
                        <select data-dw-from class="border border-hxline rounded-lg px-2 py-1.5 text-[12px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-200 flex-1">${dayOpts('from')}</select>
                        <span class="text-muted">止</span>
                        <select data-dw-to class="border border-hxline rounded-lg px-2 py-1.5 text-[12px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-200 flex-1">${dayOpts('to')}</select>
                    </div>
                    <button onclick="HXUI.applyDayWindow('${id}')" class="mt-3 w-full px-4 py-1.5 rounded-lg text-[12px] font-medium text-white bg-brand-500 hover:bg-brand-600 shadow-card">应用</button>
                </div>
            </div>
            <span class="text-[11px] text-muted">${dayRangeLabel(state, dayAxis)}</span>
        </div>`;
    }
    function dayRange(state, dayAxis) {
        const mode = state.dayMode || '7d';
        const D = dayAxis ? dayAxis.dayCount : HXD.DAY_COUNT;
        if (mode === 'today') return [D - 1, D - 1];
        if (mode === '7d') return [D - 7, D - 1];
        if (mode === '30d') return [D - 30, D - 1];
        if (mode === 'custom') {
            const c = state.dayCustom || {};
            const from = c.from != null ? c.from : 0;
            const to = c.to != null ? c.to : D - 1;
            return [Math.min(from, to), Math.max(from, to)];
        }
        return [0, D - 1];
    }
    function dayRangeLabel(state, dayAxis) {
        const [a, b] = dayRange(state, dayAxis);
        const LB = dayAxis ? dayAxis.dayLabels : HXD.DAY_LABELS;
        return LB[a] + ' ~ ' + LB[b];
    }
    function setDayWindow(id, mode) {
        if (mode === 'custom') { toggleDayCustomPop(id); return; }
        closeDayPops();
        document.getElementById(id).dispatchEvent(new CustomEvent('hx-window-change', { detail: { dayMode: mode }, bubbles: true }));
    }
    function toggleDayCustomPop(id) {
        const pop = document.getElementById(id) && document.getElementById(id).querySelector('[data-dw-pop]');
        if (!pop) return;
        pop.classList.toggle('hidden');
    }
    function closeDayPops() {
        document.querySelectorAll('[data-dw-pop]').forEach(p => p.classList.add('hidden'));
    }
    function applyDayWindow(id) {
        const box = document.getElementById(id);
        if (!box) return;
        const from = +box.querySelector('[data-dw-from]').value;
        const to = +box.querySelector('[data-dw-to]').value;
        closeDayPops();
        box.dispatchEvent(new CustomEvent('hx-window-change', { detail: { dayMode: 'custom', dayCustom: { from: Math.min(from, to), to: Math.max(from, to) } }, bubbles: true }));
    }
    // 点击弹层外部关闭（模块级单次绑定，防监听器泄漏）
    document.addEventListener('click', e => {
        if (!e.target.closest('[data-dw-pop]') && !e.target.closest('[data-dw="custom"]')) closeDayPops();
    });

    // 阶段轴（退费）：全部 / 开班期 / 日常行课 / 行课后服务
    function stageWindowHtml(state, id) {
        id = id || 'hxStageWin';
        const sel = state.stage || 'all';
        const MAP = [['all', '全部阶段'], ['open', '开班期'], ['ongoing', '日常行课'], ['after', '行课后服务']];
        return `<div class="flex items-center gap-2 text-[12px]" id="${id}">
            <span class="text-muted">退费阶段</span>
            <div class="flex items-center gap-1 p-0.5 bg-slate-100/70 rounded-lg">
                ${MAP.map(([k, l]) => `<button data-sw="${k}" onclick="HXUI.setStageWindow('${id}','${k}')" class="px-3 py-1 rounded-md text-[12px] font-medium transition-all ${sel === k ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">${l}</button>`).join('')}
            </div>
            <span class="text-[11px] text-muted">开班期＝首讲（09-02）前后7天</span>
        </div>`;
    }
    function setStageWindow(id, mode) {
        document.getElementById(id).dispatchEvent(new CustomEvent('hx-window-change', { detail: { stage: mode }, bubbles: true }));
    }

    // ---------- query-first 筛选条 ----------
    // filters: [{key, label, options:[str|{v,label}], allLabel?, value}]  state 里 draft 与 applied 分离
    // extra: 可选，嵌入筛选条的额外区块（如时间窗口选择器），置于操作按钮组左侧
    function queryBarHtml(state, filters, extra) {
        const pending = JSON.stringify(state.draft) !== JSON.stringify(state.applied);
        return `<div class="bg-white rounded-2xl border border-hxline shadow-card px-5 py-3.5 flex items-center gap-3 flex-wrap sticky top-[68px] z-20">
            ${filters.map(f => `
                <label class="flex items-center gap-1.5 text-[12px]">
                    <span class="text-muted whitespace-nowrap">${f.label}</span>
                    <select data-qf="${f.key}" class="border border-hxline rounded-lg px-2.5 py-1.5 text-[12px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-200">
                        <option value="">${f.allLabel || ('全部' + f.label)}</option>
                        ${f.options.map(o => {
        const v = typeof o === 'object' ? o.v : o;
        const l = typeof o === 'object' ? o.label : o;
        return `<option value="${v}" ${String(state.draft[f.key]) === String(v) ? 'selected' : ''}>${l}</option>`;
    }).join('')}
                    </select>
                </label>`).join('')}
            ${extra ? `<div class="flex items-center">${extra}</div>` : ''}
            <div class="flex items-center gap-2 ml-auto">
                ${pending ? '<span class="hx-pending text-[11px] px-2.5 py-1 rounded-lg border">条件已修改 · 待查询</span>' : '<span class="text-[11px] text-muted">当前条件已生效</span>'}
                <button onclick="HXUI.queryReset()" class="px-3 py-1.5 rounded-lg text-[12px] text-muted hover:text-brand-600">重置</button>
                <button onclick="HXUI.queryApply()" ${pending ? '' : 'disabled'} class="px-4 py-1.5 rounded-lg text-[12px] font-medium text-white ${pending ? 'bg-brand-500 hover:bg-brand-600 shadow-card' : 'bg-slate-300 cursor-not-allowed'}">查询</button>
            </div>
        </div>`;
    }
    function bindQueryBar(state, rerender) {
        document.querySelectorAll('[data-qf]').forEach(sel => {
            sel.onchange = () => { state.draft[sel.dataset.qf] = sel.value; rerender(); };
        });
    }
    function queryApply() { document.dispatchEvent(new CustomEvent('hx-query-apply')); }
    function queryReset() { document.dispatchEvent(new CustomEvent('hx-query-reset')); }

    // ---------- 栈式抽屉 ----------
    const STACK = [];
    function drawerPush(title, bodyHtml, width) {
        const depth = STACK.length;
        const overlay = document.createElement('div');
        overlay.className = 'hx-drawer-overlay';
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-[#111b31]/30" onclick="HXUI.drawerPop()"></div>
            <div class="hx-drawer-panel">
                <div class="hx-drawer-head">
                    <div class="flex items-center gap-2">
                        ${depth > 0 ? '<button onclick="HXUI.drawerPop()" class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-sub text-sm">‹</button>' : ''}
                        <h3 class="font-bold text-[15px] text-ink">${title}</h3>
                    </div>
                    <button onclick="HXUI.drawerCloseAll()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 text-xl">✕</button>
                </div>
                <div class="flex-1 overflow-y-auto p-5 space-y-4 hx-drawer-body">${bodyHtml}</div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => { overlay.querySelector('.hx-drawer-panel').style.transform = 'translateX(0)'; });
        STACK.push(overlay);
    }
    function drawerPop() {
        const ov = STACK.pop();
        if (!ov) return;
        const p = ov.querySelector('.hx-drawer-panel');
        p.style.transform = 'translateX(100%)';
        setTimeout(() => ov.remove(), 250);
    }
    function drawerCloseAll() { while (STACK.length) drawerPop(); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') drawerPop(); });

    // ---------- 分位图例（opts.noTitle=只留四色块，去掉「底色＝…」说明文字） ----------
    function quotaLegend(opts = {}) {
        return `<div class="flex items-center gap-4 text-[11px] text-muted flex-wrap">
            ${opts.noTitle ? '' : '<span class="font-medium text-sub">底色＝当前父级下的同级排名</span>'}
            <span class="flex items-center gap-1.5"><i class="w-3 h-3 rounded-sm" style="background:var(--hx-lead)"></i>领先（前25%）</span>
            <span class="flex items-center gap-1.5"><i class="w-3 h-3 rounded-sm" style="background:var(--hx-normal)"></i>正常</span>
            <span class="flex items-center gap-1.5"><i class="w-3 h-3 rounded-sm" style="background:var(--hx-low)"></i>偏低（后40%）</span>
            <span class="flex items-center gap-1.5"><i class="w-3 h-3 rounded-sm" style="background:var(--hx-risk)"></i>需关注（后25%）</span>
        </div>`;
    }

    // ---------- 达标标记（绝对目标，与分位底色正交） ----------
    function targetMark(value, target, better) {
        if (value == null || target == null) return '';
        const ok = better === 'lower' ? value <= target : value >= target;
        return ok ? '<span class="text-emerald-500 ml-1" title="达标">✓</span>'
            : '<span class="text-rose-400 ml-1" title="未达目标">✗</span>';
    }

    // ---------- 通用渲染（ECharts 封装：实例注册表 + dispose + 尺寸自适应） ----------
    // 对动态注入的 col-span-* 类是异步生成 CSS 的，init 时量到的宽度可能还是布局前的，
    // 必须靠 ResizeObserver 在容器尺寸变化后 resize 自愈。
    const _chartMap = {};
    let _ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        _ro = new ResizeObserver(entries => {
            for (const en of entries) {
                const c = _chartMap[en.target.id];
                if (c && !c.isDisposed() && en.target.isConnected) {
                    try { c.resize(); } catch (e) { }
                }
            }
        });
    }
    function chart(elId, option) {
        const el = document.getElementById(elId);
        if (!el || typeof echarts === 'undefined') return null;
        // 清理：同 id 旧实例 dispose；宿主已脱离文档的陈旧实例一并回收
        // 坑：ECharts 5 实例没有 .dom 属性，取宿主元素必须用 getDom()，
        //     用 c.dom 判空会把所有存活实例误当陈旧全部 dispose 掉
        Object.entries(_chartMap).forEach(([id, c]) => {
            if (c.isDisposed()) { delete _chartMap[id]; return; }
            let dom = null;
            try { dom = c.getDom(); } catch (e) { }
            if (id === elId || !dom || !dom.isConnected) {
                if (_ro && dom) { try { _ro.unobserve(dom); } catch (e) { } }
                try { c.dispose(); } catch (e) { }
                delete _chartMap[id];
            }
        });
        const c = echarts.init(el);
        _chartMap[elId] = c;
        if (_ro) _ro.observe(el);
        c.setOption(Object.assign({
            textStyle: { fontFamily: 'Inter,"PingFang SC","Microsoft YaHei",sans-serif', color: '#60708d' },
            grid: { left: 42, right: 16, top: 36, bottom: 26 },
        }, option));
        return c;
    }
    // 雷达（六指标画像）
    function radar(elId, items, title) {
        return chart(elId, {
            title: title ? { text: title, left: 8, top: 4, textStyle: { fontSize: 13, color: '#14213d' } } : undefined,
            radar: {
                indicator: items.map(i => ({ name: i.name, max: 100 })),
                radius: '62%', splitNumber: 4,
                axisName: { color: '#60708d', fontSize: 11 },
                splitLine: { lineStyle: { color: '#dbe3ef' } },
                splitArea: { areaStyle: { color: ['#fff', '#f7f9fc'] } },
            },
            series: [{ type: 'radar', data: [{ value: items.map(i => i.value == null ? 0 : Math.round(i.value)), areaStyle: { color: 'rgba(47,111,237,.13)' }, lineStyle: { color: '#2f6fed' }, itemStyle: { color: '#2f6fed' } }] }],
        });
    }
    // 多序列趋势折线
    function trend(elId, seriesArr, xLabels, yMax) {
        return chart(elId, {
            tooltip: { trigger: 'axis' },
            legend: { top: 0, data: seriesArr.map(s => s.name), textStyle: { color: '#60708d', fontSize: 11 } },
            xAxis: { type: 'category', data: xLabels, axisLabel: { fontSize: 10 } },
            yAxis: { type: 'value', max: yMax || 100, axisLabel: { formatter: '{value}%' } },
        series: seriesArr.map(s => ({
            name: s.name, type: 'line', smooth: true, symbolSize: 4,
            data: s.points.map(p => p == null ? null : +p.toFixed(1)),
            lineStyle: { color: s.color, ...(s.dash ? { type: 'dashed' } : {}) },
            itemStyle: { color: s.color },
            markPoint: s.marks && s.marks.length ? { data: s.marks } : undefined,
        })),
        });
    }

    // ---------- 自定义对比抽屉 ----------
    // cfg: {units, dims(可选主维度), metrics, onRender}
    function compareDrawer(units, dims, metrics, opt) {
        opt = opt || {};
        const dimOpts = (dims || HXD.DIMENSIONS.filter(d => d.key !== 'teacherName' && d.key !== 'isNewDim')).map(d => d.name);
        const state = { dim: dimOpts[0], members: [], metricKeys: opt.metricKeys || metrics.slice(0, 2).map(m => m.key) };
        HXUI.drawerPush('自定义对比', `
            <div class="bg-white rounded-xl border border-hxline p-4 space-y-4">
                <div>
                    <div class="text-[12px] text-muted mb-1.5">主维度</div>
                    <select id="cmp-dim" class="border border-hxline rounded-lg px-2.5 py-1.5 text-[12px] bg-white">
                        ${dimOpts.map(d => `<option>${d}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <div class="text-[12px] text-muted mb-1.5">对比项（勾选，≤6 个）</div>
                    <div id="cmp-members" class="flex flex-wrap gap-2"></div>
                </div>
                <div>
                    <div class="text-[12px] text-muted mb-1.5">指标（≤4 个）</div>
                    <div id="cmp-metrics" class="flex flex-wrap gap-2"></div>
                </div>
                <button id="cmp-run" class="w-full py-2.5 rounded-xl bg-brand-500 text-white font-medium hover:bg-brand-600">生成对比</button>
            </div>
            <div id="cmp-result"></div>
        `, 'max-w-3xl');

        const dimByName = n => HXD.DIMENSIONS.find(d => d.name === n);
        function renderMembers() {
            const d = dimByName(state.dim);
            const names = [...new Set(units.map(u => HXD.dimValue(u, d.key)))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
            document.getElementById('cmp-members').innerHTML = names.map(n => `
                <label class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] cursor-pointer transition-all ${state.members.includes(n) ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-hxline text-sub hover:border-brand-300'}">
                    <input type="checkbox" ${state.members.includes(n) ? 'checked' : ''} data-member="${n}"> ${n}
                </label>`).join('');
            document.querySelectorAll('[data-member]').forEach(cb => {
                cb.onchange = () => {
                    const n = cb.dataset.member;
                    if (cb.checked) { if (state.members.length >= 6) { cb.checked = false; return toast('对比项最多 6 个'); } state.members.push(n); }
                    else state.members = state.members.filter(x => x !== n);
                    renderMembers();
                };
            });
        }
        renderMembers();
        document.getElementById('cmp-dim').onchange = e => { state.dim = e.target.value; state.members = []; renderMembers(); };
        document.getElementById('cmp-metrics').innerHTML = metrics.map(m => `
            <label class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] cursor-pointer ${state.metricKeys.includes(m.key) ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-hxline text-sub'}" data-metric-label="${m.key}">
                <input type="checkbox" ${state.metricKeys.includes(m.key) ? 'checked' : ''} data-metric="${m.key}"> ${m.name}
            </label>`).join('');
        document.querySelectorAll('[data-metric]').forEach(cb => {
            cb.onchange = () => {
                const k = cb.dataset.metric;
                if (cb.checked) { if (state.metricKeys.length >= 4) { cb.checked = false; return toast('指标最多 4 个'); } state.metricKeys.push(k); }
                else state.metricKeys = state.metricKeys.filter(x => x !== k);
                cb.closest('label').className = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] cursor-pointer ${state.metricKeys.includes(k) ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-hxline text-sub'}`;
            };
        });
        document.getElementById('cmp-run').onclick = () => {
            const d = dimByName(state.dim);
            const rows = state.members.map(nm => {
                const us = units.filter(u => HXD.dimValue(u, d.key) === nm);
                const a = HXD.agg(us, opt);
                return { name: nm, sample: a.unitCount, vals: state.metricKeys.map(k => HXD.METRICS[k].num(a)) };
            });
            document.getElementById('cmp-result').innerHTML = rows.length ? `
                <div class="bg-white rounded-xl border border-hxline overflow-hidden">
                    <table class="w-full text-[13px]">
                        <thead><tr class="text-muted bg-[#f4f7fb] text-[12px]"><th class="px-4 py-2.5 text-left font-medium">${state.dim}</th><th class="px-4 py-2.5 text-right font-medium">样本量</th>${state.metricKeys.map(k => `<th class="px-4 py-2.5 text-right font-medium" style="color:${HXD.METRICS[k].color}">${HXD.METRICS[k].name}</th>`).join('')}</tr></thead>
                        <tbody>${rows.map(r => `<tr class="border-t border-hxline-light">
                            <td class="px-4 py-2.5 font-medium text-ink">${r.name}</td>
                            <td class="px-4 py-2.5 text-right text-muted tabular-nums">${r.sample}</td>
                            ${r.vals.map((v, i) => `<td class="px-4 py-2.5 text-right tabular-nums font-semibold" style="color:${HXD.METRICS[state.metricKeys[i]].color}">${fmt(v, HXD.METRICS[state.metricKeys[i]].rate !== false)}</td>`).join('')}
                        </tr>`).join('')}</tbody>
                    </table>
                </div>` : '<div class="text-muted text-[13px] py-8 text-center">请选择对比项</div>';
        };
    }

    // ---------- V9 风格筛选条（对齐锦书驾驶舱） ----------
    // state.draft / state.applied 形如：
    //   { year:'26', season:'autumn', periods:['1','2','3'], grades:[], subjects:[], lectureMode:'all', lectures:[] }
    // cfg: { years:[{v,label,short}], seasons:[{v,label,char}], periods:[{v,label}],
    //        periodLectures:{'1':[1..6],...}, grades:[...], subjects:[...], lectureCount:N }
    const _FB_CSS = `
.hx-fb-wrap{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hx-fb-range,.hx-fb-btn{height:40px;min-width:118px;border:1px solid #dbe4f0;background:#f8faff;border-radius:8px;position:relative;text-align:left;padding:13px 30px 0 12px;font-size:12px;line-height:14px;color:var(--hx-ink,#163563);box-shadow:0 1px 0 rgba(22,53,99,.03)}
.hx-fb-range{min-width:150px;font-weight:600;border-color:#c4d4ef;background:#f4f8ff}
.hx-fb-range:before,.hx-fb-btn:before{content:attr(data-label);position:absolute;left:12px;top:5px;color:#94a3bd;font-size:10px;line-height:10px;font-weight:400}
.hx-fb-range:after,.hx-fb-btn:after{content:"";position:absolute;right:12px;top:16px;width:6px;height:6px;border-right:1px solid #7c8db0;border-bottom:1px solid #7c8db0;transform:rotate(45deg)}
.hx-fb-range:hover,.hx-fb-btn:hover{border-color:#93b4ec;background:#fff}
.hx-fb-range.open{border-color:#2f6fed;box-shadow:0 0 0 2px rgba(47,111,237,.12)}
.hx-fb-btn.has{border-color:#7fa7f2;background:#eef4ff;color:#1a4fc4}
.hx-fb-actions{display:flex;align-items:center;gap:8px;margin-left:auto;padding-left:13px;border-left:1px solid #e5e9f2}
.hx-fb-state{min-width:76px;text-align:right;color:#7c8db0;font-size:11px}
.hx-fb-state.pending{color:#b47d1d;font-weight:600}
.hx-fb-reset{height:40px;padding:0 14px;border:1px solid #dbe4f0;border-radius:8px;background:#fff;color:#5d6f8f;font-size:12px}
.hx-fb-reset:hover{border-color:#93b4ec;background:#f8faff}
.hx-fb-query{height:40px;min-width:84px;border:1px solid #2f6fed;border-radius:8px;background:#2f6fed;color:#fff;font-weight:600;font-size:12px;box-shadow:0 4px 10px rgba(47,111,237,.2);transition:.15s}
.hx-fb-query:hover:not(:disabled){background:#2564d8;transform:translateY(-1px)}
.hx-fb-query:disabled{cursor:default;color:#8b9ab5;border-color:#dbe4f0;background:#eef1f6;box-shadow:none;transform:none}
.hx-fb-pop{display:none;position:absolute;top:calc(100% + 6px);z-index:40;background:#fff;border:1px solid #e5e9f2;box-shadow:0 12px 32px rgba(22,53,99,.14);border-radius:10px;padding:14px;min-width:300px}
.hx-fb-pop.open{display:block}
.hx-fb-pop-head{display:flex;align-items:center;margin-bottom:10px}
.hx-fb-pop-head b{font-size:13px;color:#163563}
.hx-fb-pop-head .hx-fb-summary{margin-left:auto;color:#2f6fed;font-weight:600;font-size:12px}
.hx-fb-pop-head button.hx-fb-clear{margin-left:auto;border:0;background:none;color:#2f6fed;font-size:12px}
.hx-fb-opt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.hx-fb-opt{border:1px solid #e5e9f2;background:#fff;border-radius:6px;padding:8px 6px;font-size:12px;color:#3d4f70;text-align:center}
.hx-fb-opt:hover{border-color:#93b4ec}
.hx-fb-opt.active{border-color:#2f6fed;background:#eef4ff;color:#1a4fc4;font-weight:600}
.hx-fb-pop-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.hx-fb-btn2{border:1px solid #e5e9f2;background:#fff;border-radius:6px;padding:7px 14px;font-size:12px;color:#3d4f70}
.hx-fb-btn2.primary{background:#2f6fed;border-color:#2f6fed;color:#fff}
.hx-fb-range-pop{left:0;width:720px;padding:0;overflow:hidden}
.hx-fb-range-pop .hx-fb-pop-head{padding:14px 18px;margin:0;border-bottom:1px solid #e5e9f2}
.hx-fb-range-cols{display:grid;grid-template-columns:repeat(3,1fr);min-height:238px}
.hx-fb-range-col{padding:14px 16px;border-right:1px solid #e5e9f2}
.hx-fb-range-col:last-child{border-right:0}
.hx-fb-range-col-title{color:#94a3bd;font-size:11px;margin-bottom:9px}
.hx-fb-choice{width:100%;border:0;background:transparent;border-radius:6px;padding:9px 11px;margin-bottom:5px;text-align:left;color:#3d4f70;font-size:12px;position:relative}
.hx-fb-choice:hover{background:#f5f8ff}
.hx-fb-choice.active{background:#eef4ff;color:#1a4fc4;font-weight:600}
.hx-fb-choice.active:after{content:"✓";position:absolute;right:12px;font-size:14px}
.hx-fb-lecture-pop{width:390px}
.hx-fb-lecture-modes{display:flex;gap:6px;margin-bottom:10px}
.hx-fb-lecture-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.hx-fb-lecture-opt{border:1px solid #e5e9f2;background:#fff;border-radius:5px;padding:7px 3px;font-size:11px;color:#3d4f70;text-align:center}
.hx-fb-lecture-opt.active{background:#eef4ff;border-color:#2f6fed;color:#1a4fc4;font-weight:600}
`;
    (function injectFbCss() {
        if (!document.getElementById('hx-fb-style')) {
            const s = document.createElement('style');
            s.id = 'hx-fb-style';
            s.textContent = _FB_CSS;
            document.head.appendChild(s);
        }
    })();

    function fbLectureSet(sel, cfg) {
        let set = new Set();
        (sel.periods || []).forEach(p => (cfg.periodLectures[p] || []).forEach(n => set.add(n)));
        if (sel.lectureMode === 'latest') {
            const arr = [...set].sort((a, b) => a - b);
            return arr.length ? new Set([arr[arr.length - 1]]) : new Set();
        }
        if (sel.lectureMode === 'custom') return new Set((sel.lectures || []).filter(n => set.has(n)));
        return set;
    }

    function fbRangeText(sel, cfg) {
        const y = cfg.years.find(x => x.v === sel.year) || cfg.years[0];
        const s = cfg.seasons.find(x => x.v === sel.season) || cfg.seasons[0];
        const ps = ((cfg.periodsBySeason && cfg.periodsBySeason[sel.season]) || cfg.periods)
            .filter(p => (sel.periods || []).includes(p.v)).map(p => p.label.replace(/^第?暑?/, '').replace('期', ''));
        return `${y.short}${s.char} · ${ps.length ? ps.join('、') + '期' : '未选期次'}`;
    }

    function fbLectureText(sel, cfg) {
        const set = fbLectureSet(sel, cfg);
        if (sel.lectureMode === 'all') return '全部已结束讲次';
        if (sel.lectureMode === 'latest') { const a = [...set]; return a.length ? `第${a[0]}讲` : '—'; }
        const a = [...set].sort((x, y) => x - y);
        if (!a.length) return '自选 0 讲';
        if (a.length === 1) return `第${a[0]}讲`;
        const cont = a.every((n, i) => i === 0 || n === a[i - 1] + 1);
        return cont ? `第${a[0]}–${a[a.length - 1]}讲` : `已选 ${a.length} 讲`;
    }

    function filterBarV9Html(state, cfg) {
        const d = state.draft;
        const gradeTxt = d.grades.length ? d.grades.join('、') : '全部年级';
        const subjectTxt = d.subjects.length ? d.subjects.join('、') : '全部学科';
        return `<div class="hx-fb-wrap" id="hxFB">
            <button class="hx-fb-range" id="fb-range-trigger" data-label="学年 · 学季 · 期次"><span id="fb-range-txt">${fbRangeText(d, cfg)}</span></button>
            <button class="hx-fb-btn ${d.grades.length ? 'has' : ''}" data-fb="grades" data-label="年级"><span id="fb-grades-txt">${gradeTxt}</span></button>
            <button class="hx-fb-btn ${d.subjects.length ? 'has' : ''}" data-fb="subjects" data-label="学科"><span id="fb-subjects-txt">${subjectTxt}</span></button>
            ${cfg.extraHtml ? `<div class="flex items-center">${cfg.extraHtml}</div>` : ''}
            ${cfg.hideLecture ? '' : `<button class="hx-fb-btn ${d.lectureMode !== 'all' ? 'has' : ''}" id="fb-lecture-trigger" data-label="统计讲次"><span id="fb-lecture-txt">${fbLectureText(d, cfg)}</span></button>`}
            <div class="hx-fb-actions">
                <span class="hx-fb-state" id="fb-state">当前条件已生效</span>
                <button class="hx-fb-reset" id="fb-reset">重置</button>
                <button class="hx-fb-query" id="fb-query" disabled>查询</button>
            </div>
            <div class="hx-fb-pop hx-fb-range-pop" id="fb-range-pop">
                <div class="hx-fb-pop-head"><b>选择学年、学季与期次</b><span class="hx-fb-summary" id="fb-range-summary"></span></div>
                <div class="hx-fb-range-cols">
                    <div class="hx-fb-range-col"><div class="hx-fb-range-col-title">学年（单选）</div><div id="fb-year-choices"></div></div>
                    <div class="hx-fb-range-col"><div class="hx-fb-range-col-title">学季（单选）</div><div id="fb-season-choices"></div></div>
                    <div class="hx-fb-range-col"><div class="hx-fb-range-col-title">期次（多选）</div><div id="fb-period-choices"></div></div>
                </div>
                <div class="hx-fb-pop-actions" style="border-top:1px solid #e5e9f2;padding:12px 16px;margin:0 -14px -14px">
                    <button class="hx-fb-btn2" id="fb-range-cancel">取消</button>
                    <button class="hx-fb-btn2 primary" id="fb-range-apply">确定</button>
                </div>
            </div>
            <div class="hx-fb-pop" id="fb-filter-pop">
                <div class="hx-fb-pop-head"><b id="fb-filter-title">选择</b><button class="hx-fb-clear" id="fb-filter-clear">清空</button></div>
                <div class="hx-fb-opt-grid" id="fb-filter-options"></div>
                <div class="hx-fb-pop-actions"><button class="hx-fb-btn2" id="fb-filter-cancel">取消</button><button class="hx-fb-btn2 primary" id="fb-filter-apply">应用</button></div>
            </div>
            ${cfg.hideLecture ? '' : `<div class="hx-fb-pop hx-fb-lecture-pop" id="fb-lecture-pop">
                <div class="hx-fb-pop-head"><b>选择统计讲次</b></div>
                <div class="hx-fb-lecture-modes">
                    <button class="hx-fb-btn2" data-fb-mode="all">全部讲次</button>
                    <button class="hx-fb-btn2" data-fb-mode="latest">最近一讲</button>
                    <button class="hx-fb-btn2" data-fb-mode="custom">自选讲次</button>
                </div>
                <div class="hx-fb-lecture-grid" id="fb-lecture-grid"></div>
                <div class="hx-fb-pop-actions"><button class="hx-fb-btn2 primary" id="fb-lecture-apply">应用</button></div>
            </div>`}
        </div>`;
    }

    function bindFilterBarV9(state, cfg) {
        const wrap = document.getElementById('hxFB');
        if (!wrap) return;
        const $ = id => wrap.querySelector('#' + id);
        const pops = ['fb-range-pop', 'fb-filter-pop', 'fb-lecture-pop'].map($);
        const closePops = () => { pops.forEach(p => p && p.classList.remove('open')); const rt = $('fb-range-trigger'); rt && rt.classList.remove('open'); };
        const isOpen = p => p.classList.contains('open');

        function updateBar() {
            const d = state.draft;
            const pending = JSON.stringify(state.draft) !== JSON.stringify(state.applied);
            $('fb-range-txt').textContent = fbRangeText(d, cfg);
            $('fb-grades-txt').textContent = d.grades.length ? d.grades.join('、') : '全部年级';
            $('fb-subjects-txt').textContent = d.subjects.length ? d.subjects.join('、') : '全部学科';
            if ($('fb-lecture-txt')) $('fb-lecture-txt').textContent = fbLectureText(d, cfg);
            wrap.querySelector('[data-fb="grades"]').classList.toggle('has', d.grades.length > 0);
            wrap.querySelector('[data-fb="subjects"]').classList.toggle('has', d.subjects.length > 0);
            const lt = $('fb-lecture-trigger');
            if (lt) lt.classList.toggle('has', d.lectureMode !== 'all');
            $('fb-state').textContent = pending ? '有修改待查询' : '当前条件已生效';
            $('fb-state').classList.toggle('pending', pending);
            $('fb-query').disabled = !pending;
        }

        function positionPop(pop, trigger) {
            const host = wrap.getBoundingClientRect();
            const r = trigger.getBoundingClientRect();
            pop.style.left = Math.max(8, Math.min(r.left - host.left, host.width - pop.offsetWidth - 8)) + 'px';
        }

        // ---- 年级/学科多选 ----
        let fbKey = null, fbTemp = [];
        wrap.querySelectorAll('[data-fb]').forEach(btn => {
            if (btn.id === 'fb-lecture-trigger') return;
            btn.onclick = e => {
                e.stopPropagation();
                const wasOpen = isOpen($('fb-filter-pop')) && fbKey === btn.dataset.fb;
                closePops();
                if (wasOpen) return;
                fbKey = btn.dataset.fb;
                fbTemp = state.draft[fbKey].slice();
                $('fb-filter-title').textContent = fbKey === 'grades' ? '选择年级' : '选择学科';
                const opts = fbKey === 'grades' ? cfg.grades : cfg.subjects;
                $('fb-filter-options').innerHTML = opts.map(o =>
                    `<button class="hx-fb-opt ${fbTemp.includes(o) ? 'active' : ''}" data-fb-opt="${o}">${o}</button>`).join('');
                positionPop($('fb-filter-pop'), btn);
                $('fb-filter-pop').classList.add('open');
                wrap.querySelectorAll('[data-fb-opt]').forEach(b => {
                    b.onclick = ev => {
                        ev.stopPropagation();
                        const o = b.dataset.fbOpt;
                        const i = fbTemp.indexOf(o);
                        i >= 0 ? fbTemp.splice(i, 1) : fbTemp.push(o);
                        b.classList.toggle('active');
                    };
                });
            };
        });
        $('fb-filter-pop').onclick = e => e.stopPropagation();
        $('fb-filter-clear').onclick = () => { fbTemp = []; wrap.querySelectorAll('[data-fb-opt]').forEach(b => b.classList.remove('active')); };
        $('fb-filter-cancel').onclick = closePops;
        $('fb-filter-apply').onclick = () => {
            const sorted = fbKey === 'grades'
                ? cfg.grades.filter(g => fbTemp.includes(g))
                : cfg.subjects.filter(s => fbTemp.includes(s));
            state.draft[fbKey] = sorted;
            closePops(); updateBar();
        };

        // ---- 学年·学季·期次（periodsBySeason 支持按学季期次联动；切学季时重置为该学季默认期次） ----
        let rangeTemp = null;
        function seasonPeriods(season) {
            return (cfg.periodsBySeason && cfg.periodsBySeason[season]) || cfg.periods;
        }
        function renderRangeChoices() {
            const years = cfg.years, seasons = cfg.seasons, periods = seasonPeriods(rangeTemp.season);
            $('fb-year-choices').innerHTML = years.map(x =>
                `<button class="hx-fb-choice ${rangeTemp.year === x.v ? 'active' : ''}" data-r-year="${x.v}">${x.label}</button>`).join('');
            $('fb-season-choices').innerHTML = seasons.map(x =>
                `<button class="hx-fb-choice ${rangeTemp.season === x.v ? 'active' : ''}" data-r-season="${x.v}">${x.label}</button>`).join('');
            $('fb-period-choices').innerHTML = periods.map(x =>
                `<button class="hx-fb-choice ${rangeTemp.periods.includes(x.v) ? 'active' : ''}" data-r-period="${x.v}">${x.label}</button>`).join('');
            $('fb-range-summary').textContent = fbRangeText(rangeTemp, cfg);
            wrap.querySelectorAll('[data-r-year]').forEach(b => b.onclick = () => { rangeTemp.year = b.dataset.rYear; renderRangeChoices(); });
            wrap.querySelectorAll('[data-r-season]').forEach(b => b.onclick = () => {
                if (rangeTemp.season !== b.dataset.rSeason) {
                    rangeTemp.season = b.dataset.rSeason;
                    // 切学季 → 期次重置为该学季默认（未配置 defaultPeriodsBySeason 的页面=该学季全选）
                    rangeTemp.periods = (cfg.defaultPeriodsBySeason && cfg.defaultPeriodsBySeason[b.dataset.rSeason]
                        ? cfg.defaultPeriodsBySeason[b.dataset.rSeason]
                        : seasonPeriods(b.dataset.rSeason).map(p => p.v)).slice();
                }
                renderRangeChoices();
            });
            wrap.querySelectorAll('[data-r-period]').forEach(b => b.onclick = () => {
                const p = b.dataset.rPeriod;
                const i = rangeTemp.periods.indexOf(p);
                i >= 0 ? rangeTemp.periods.splice(i, 1) : rangeTemp.periods.push(p);
                renderRangeChoices();
            });
        }
        $('fb-range-trigger').onclick = e => {
            e.stopPropagation();
            const wasOpen = isOpen($('fb-range-pop'));
            closePops();
            if (wasOpen) return;
            rangeTemp = { year: state.draft.year, season: state.draft.season, periods: state.draft.periods.slice() };
            renderRangeChoices();
            $('fb-range-pop').classList.add('open');
            $('fb-range-trigger').classList.add('open');
        };
        $('fb-range-pop').onclick = e => e.stopPropagation();
        $('fb-range-cancel').onclick = closePops;
        $('fb-range-apply').onclick = () => {
            if (!rangeTemp.periods.length) { toast('请至少保留一个期次'); return; }
            state.draft.year = rangeTemp.year;
            state.draft.season = rangeTemp.season;
            state.draft.periods = rangeTemp.periods.slice();
            closePops(); updateBar();
        };

        // ---- 统计讲次（cfg.hideLecture=true 时不渲染，如老带新页无讲次概念） ----
        if (!cfg.hideLecture) {
        let lecMode = 'all', lecSet = new Set();
        function renderLectureGrid() {
            const inPeriods = new Set();
            state.draft.periods.forEach(p => (cfg.periodLectures[p] || []).forEach(n => inPeriods.add(n)));
            $('fb-lecture-grid').innerHTML = Array.from({ length: cfg.lectureCount }, (_, i) => i + 1).map(n =>
                `<button class="hx-fb-lecture-opt ${lecSet.has(n) ? 'active' : ''}" ${inPeriods.has(n) ? '' : 'disabled style="opacity:.35"'} data-fb-lec="${n}">第${n}讲</button>`).join('');
            wrap.querySelectorAll('[data-fb-lec]').forEach(b => {
                if (b.disabled) return;
                b.onclick = () => {
                    const n = +b.dataset.fbLec;
                    lecMode = 'custom';
                    lecSet.has(n) ? lecSet.delete(n) : lecSet.add(n);
                    renderLectureGrid();
                };
            });
        }
        $('fb-lecture-trigger').onclick = e => {
            e.stopPropagation();
            const wasOpen = isOpen($('fb-lecture-pop'));
            closePops();
            if (wasOpen) return;
            lecMode = state.draft.lectureMode;
            lecSet = fbLectureSet(state.draft, cfg);
            renderLectureGrid();
            positionPop($('fb-lecture-pop'), $('fb-lecture-trigger'));
            $('fb-lecture-pop').classList.add('open');
        };
        $('fb-lecture-pop').onclick = e => e.stopPropagation();
        wrap.querySelectorAll('[data-fb-mode]').forEach(b => {
            b.onclick = () => {
                lecMode = b.dataset.fbMode;
                if (lecMode === 'all' || lecMode === 'latest') lecSet = fbLectureSet({ ...state.draft, lectureMode: lecMode, lectures: [] }, cfg);
                renderLectureGrid();
            };
        });
        $('fb-lecture-apply').onclick = () => {
            if (lecMode === 'custom' && !lecSet.size) { toast('请至少选择一个讲次'); return; }
            state.draft.lectureMode = lecMode;
            state.draft.lectures = [...lecSet].sort((a, b) => a - b);
            closePops(); updateBar();
        };
        }

        // ---- 查询 / 重置 / 外部点击 ----
        $('fb-query').onclick = () => {
            closePops();
            document.dispatchEvent(new CustomEvent('hx-query-apply'));
        };
        $('fb-reset').onclick = () => {
            closePops();
            document.dispatchEvent(new CustomEvent('hx-query-reset'));
        };
        if (window.__hxFBOutside) document.removeEventListener('click', window.__hxFBOutside);
        window.__hxFBOutside = e => { if (!wrap.contains(e.target)) closePops(); };
        document.addEventListener('click', window.__hxFBOutside);
        updateBar();
        return { updateBar, closePops };
    }

    return {
        toast, fmt, kpiRow,
        lectureWindowHtml, lectureSet, setLectureWindow, openLecturePicker,
        dayWindowHtml, dayRange, dayRangeLabel, setDayWindow, applyDayWindow, closeDayPops,
        stageWindowHtml, setStageWindow,
        queryBarHtml, bindQueryBar, queryApply, queryReset,
        filterBarV9Html, bindFilterBarV9, fbLectureSet,
        drawerPush, drawerPop, drawerCloseAll,
        quotaLegend, targetMark, kpiClick,
        chart, radar, trend,
        compareDrawer,
    };
})();
