/* =========================================================
 * HX_Dashboard common.js — 公共组件与工具
 * 依赖：mock-data.js（先加载）、Tailwind CDN、ECharts CDN
 * ========================================================= */

const HX = {
    // ---------- 侧边栏 ----------
    MENU: [
        { key: 'index', title: '看板总览', icon: '📊', page: 'index.html' },
        { key: 'core-course', title: '核心课数据', icon: '📚', page: 'core-course.html' },
        {
            key: 'communication', title: '沟通数据', icon: '💬', children: [
                { key: 'comm-matrix', title: '沟通看板', page: 'matrix.html' },
            ]
        },
        { key: 'refund', title: '退费数据', icon: '⚠️', page: 'refund.html' },
        { key: 'referral', title: '老带新', icon: '🤝', page: 'referral.html' },
        { key: 'referral-v2', title: '老带新v2', icon: '🤝', page: 'referral-v2.html' },
        { key: 'management', title: '策略目标管理', icon: '🎯', page: 'management.html' },
    ],

    // 根据当前页面是否在 communication/ 子目录，计算正确的相对链接
    link(page, inSubDir = false) {
        const inSub = HX._inSubDir;
        if (inSubDir) return inSub ? page : 'communication/' + page;
        return inSub ? '../' + page : page;
    },
    _inSubDir: false,
    _activeKey: null,
    _topbarArgs: null,

    // 角色切换后同步刷新侧栏视角标签、顶栏头像与角色选择器。
    refreshChrome() {
        if (HX._activeKey) HX.renderSidebar(HX._activeKey);
        if (HX._topbarArgs) HX.renderTopbar(HX._topbarArgs.title, HX._topbarArgs.subtitle);
    },

    renderSidebar(activeKey) {
        HX._activeKey = activeKey;
        HX._inSubDir = activeKey.startsWith('comm');
        // 角色视角标签（v2 页面有 hx-role.js 时动态显示；v1 显示默认）
        const roleFoot = (typeof HX_ROLE !== 'undefined' && typeof HX_ROLE.footHtml === 'function')
            ? HX_ROLE.footHtml()
            : '当前视角：管理者<br>范围：全部基地业务';
        const html = `
        <aside class="hx-side fixed left-0 top-0 bottom-0 w-60 flex flex-col z-40">
            <div class="h-16 flex items-center gap-2.5 px-5 border-b border-white/10 hx-brand">
                <div class="w-9 h-9 rounded-xl hx-logo flex items-center justify-center text-white font-bold">恒</div>
                <div>
                    <small class="block text-[10px] tracking-widest">HENGXING COCKPIT</small>
                    <b class="block text-white text-[15px] leading-tight font-bold">恒行管理者后台</b>
                </div>
            </div>
            <nav class="flex-1 overflow-y-auto py-3 px-3 text-[13px]">
                <div class="px-3 pt-2 pb-1.5 hx-nav-section">数据看板</div>
                ${HX.MENU.map(m => {
            if (m.children) {
                const open = activeKey.startsWith('comm');
                const firstHref = HX.link(m.children[0].page, true);
                return `
                        <div>
                            <div class="hx-nav-item flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer font-medium" onclick="location.href='${firstHref}'">
                                <span>${m.icon}</span><span class="flex-1">${m.title}</span>
                                <svg class="w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
                            </div>
                            <div class="${open ? '' : 'hidden'} mt-1 ml-[26px] border-l-2 border-[#2a3650] space-y-0.5">
                                ${m.children.map(c => `
                                    <a href="${HX.link(c.page, true)}" class="hx-nav-sub block pl-4 pr-2 py-2 rounded-lg text-sm ${activeKey === c.key ? 'active' : ''}">${c.title}</a>
                                `).join('')}
                            </div>
                        </div>`;
            }
            const active = m.key === activeKey;
            return `
                    <a href="${HX.link(m.page)}" class="hx-nav-item flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-medium ${active ? 'active' : ''}">
                        <span>${m.icon}</span><span>${m.title}</span>
                    </a>`;
        }).join('')}
            </nav>
            <div class="p-3 hx-side-foot border-t border-white/10">
                <div class="text-[10px] px-3 pb-1.5 leading-relaxed">${roleFoot}</div>
                <div class="mx-3 px-3 py-2 rounded-lg bg-white/5 text-[10px] text-[#73819a] leading-relaxed">数据为演示 mock，非真实业务数据</div>
            </div>
        </aside>`;
        document.getElementById('sidebar').innerHTML = html;
    },

    // ---------- 顶栏 ----------
    renderTopbar(title, subtitle) {
        HX._topbarArgs = { title, subtitle };
        const html = `
        <header class="h-16 bg-white border-b border-slate-200 flex items-center gap-4 px-6 sticky top-0 z-30">
            <div class="flex-1 min-w-0">
                <h1 class="text-lg font-bold text-slate-800 truncate">${title}</h1>
                ${subtitle ? `<div class="text-xs text-slate-400 mt-0.5 truncate">${subtitle}</div>` : ''}
            </div>
            <div class="flex items-center gap-3">
                ${(typeof HX_ROLE !== 'undefined')
                ? HX_ROLE.chromeHtml()
                : `<div class="relative group">
                    <button class="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white hover:bg-slate-50">
                        <span class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">管</span>
                        ${APP.role}
                        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <div class="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 hidden group-hover:block">
                        <div class="px-3 py-2 text-sm text-indigo-600 bg-indigo-50 font-medium rounded-lg mx-1">✓ 管理者</div>
                        <div class="px-3 py-2 text-sm text-slate-400 mx-1 cursor-not-allowed" title="敬请期待">学科负责人（敬请期待）</div>
                        <div class="px-3 py-2 text-sm text-slate-400 mx-1 cursor-not-allowed" title="敬请期待">年级组长（敬请期待）</div>
                        <div class="px-3 py-2 text-sm text-slate-400 mx-1 cursor-not-allowed" title="敬请期待">组长（敬请期待）</div>
                    </div>
                </div>`}
            </div>
        </header>`;
        document.getElementById('topbar').innerHTML = html;
    },

    // ---------- 面包屑 ----------
    renderBreadcrumb(trail) {
        // trail: [{label, clickable, onClick}]
        return `
        <div class="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
            ${trail.map((t, i) => `
                ${i > 0 ? '<svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>' : ''}
                ${t.clickable
                ? `<a href="javascript:void(0)" onclick="${t.onClick}" class="text-indigo-600 hover:underline font-medium">${t.label}</a>`
                : `<span class="text-slate-800 font-medium">${t.label}</span>`}
            `).join('')}
        </div>`;
    },

    // ---------- 指标小卡行（榜单页顶部压缩摘要） ----------
    renderMetricRow(cards) {
        // cards: [{label, value, unit, target, delta, alert}]
        return `
        <div class="grid grid-cols-${Math.min(cards.length, 6)} gap-3 mb-4" style="grid-template-columns:repeat(${cards.length},minmax(0,1fr))">
            ${cards.map(c => {
            const isInt = c.unit && c.unit !== '%';
            const val = typeof c.value === 'number' ? (isInt ? Math.round(c.value).toLocaleString() : c.value.toFixed(1)) : c.value;
            const good = c.target === undefined ? null : (c.value >= c.target);
            return `
                <div class="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm ${c.alert ? 'ring-2 ring-rose-200' : ''}">
                    <div class="flex items-center gap-1.5 text-[13px] text-slate-400">
                        ${c.alert ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>' : ''}
                        ${c.label}
                    </div>
                    <div class="flex items-baseline gap-1 mt-1">
                        <span class="text-2xl font-bold tabular-nums ${c.alert ? 'text-rose-500' : 'text-slate-800'}">${val}</span>
                        <span class="text-xs text-slate-400">${c.unit || '%'}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-1 text-xs">
                        ${c.target !== undefined ? `<span class="${good ? 'text-emerald-500' : 'text-rose-500'}">${good ? '✓ 达标' : '✗ 未达目标 ' + c.target + (c.unit || '%')}</span>` : ''}
                        ${c.delta !== undefined ? `<span class="${c.delta >= 0 ? 'text-emerald-500' : 'text-slate-400'}">${c.delta >= 0 ? '↑' : '↓'} ${Math.abs(c.delta).toFixed(1)}pp</span>` : ''}
                    </div>
                </div>`;
        }).join('')}
        </div>`;
    },

    // ---------- 沟通子页互切 Tab ----------
    COMM_TABS: [
        { key: 'comm-matrix', title: '沟通看板', href: 'matrix.html' },
    ],
    renderCommTabs(activeKey) {
        return `
        <div class="flex items-center gap-1 p-1 bg-slate-100/70 rounded-xl w-fit">
            ${HX.COMM_TABS.map(t => `
                <a href="${t.href}" class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeKey === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/40'}">${t.title}</a>
            `).join('')}
        </div>`;
    },

    // ---------- 板块关联跳转 ----------
    renderRelatedLinks(links) {
        if (!links || !links.length) return '';
        return `
        <div class="flex items-center gap-2.5 flex-wrap">
            <span class="text-xs text-slate-400 font-medium shrink-0">🔗 相关模块</span>
            ${links.map(l => `
                <a href="${l.href}" class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all">
                    <span>${l.icon || '▸'}</span>
                    <span class="font-medium whitespace-nowrap">${l.title}</span>
                    ${l.desc ? `<span class="text-slate-400 font-normal hidden xl:inline">${l.desc}</span>` : ''}
                </a>`).join('')}
        </div>`;
    },

    // ---------- 达标标记 ----------
    targetMark(value, target) {
        return value >= target
            ? '<span class="text-emerald-500" title="达标">✓</span>'
            : '<span class="text-rose-400" title="未达目标">✗</span>';
    },

    // ---------- 差值色条（核心课） ----------
    diffCell(diff) {
        const th = APP.diffThreshold;
        let cls, tag;
        if (diff > th.red) { cls = 'bg-rose-50 text-rose-600'; tag = '需复盘'; }
        else if (diff > th.orange) { cls = 'bg-amber-50 text-amber-600'; tag = '关注'; }
        else { cls = 'bg-emerald-50 text-emerald-600'; tag = ''; }
        return `<span class="inline-flex items-center gap-1.5"><span class="tabular-nums font-medium">${diff.toFixed(1)}</span><span class="px-1.5 py-0.5 rounded-md text-[11px] ${cls}">${tag}</span></span>`;
    },

    // ---------- 排名徽章 ----------
    rankBadge(rank) {
        if (rank === 1) return '<span class="inline-flex w-6 h-6 rounded-full bg-amber-400 text-white items-center justify-center text-xs font-bold">1</span>';
        if (rank === 2) return '<span class="inline-flex w-6 h-6 rounded-full bg-slate-300 text-white items-center justify-center text-xs font-bold">2</span>';
        if (rank === 3) return '<span class="inline-flex w-6 h-6 rounded-full bg-orange-400 text-white items-center justify-center text-xs font-bold">3</span>';
        return `<span class="inline-flex w-6 h-6 rounded-full bg-slate-100 text-slate-500 items-center justify-center text-xs">${rank}</span>`;
    },

    // 排名变动
    rankChangeTag(change) {
        if (change > 0) return `<span class="text-emerald-500 text-xs">↑${change}</span>`;
        if (change < 0) return `<span class="text-rose-400 text-xs">↓${Math.abs(change)}</span>`;
        return '<span class="text-slate-300 text-xs">—</span>';
    },

    // ---------- 抽屉 ----------
    openDrawer(title, contentHtml, width = 'max-w-2xl') {
        const overlay = document.createElement('div');
        overlay.id = 'drawer-overlay';
        overlay.className = 'fixed inset-0 z-50';
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/30" onclick="HX.closeDrawer()"></div>
            <div class="absolute right-0 top-0 bottom-0 ${width} bg-slate-50 shadow-2xl flex flex-col drawer-panel">
                <div class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
                    <h3 class="font-bold text-slate-800">${title}</h3>
                    <button onclick="HX.closeDrawer()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 text-xl">✕</button>
                </div>
                <div class="flex-1 overflow-y-auto p-6 space-y-4">${contentHtml}</div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.querySelector('.drawer-panel').style.transform = 'translateX(0)';
        });
        const panel = overlay.querySelector('.drawer-panel');
        panel.style.transform = 'translateX(100%)';
        panel.style.transition = 'transform .25s ease';
    },
    closeDrawer() {
        const overlay = document.getElementById('drawer-overlay');
        if (!overlay) return;
        const panel = overlay.querySelector('.drawer-panel');
        panel.style.transform = 'translateX(100%)';
        setTimeout(() => overlay.remove(), 250);
    },

    // ---------- ECharts 封装 ----------
    _charts: [],
    renderChart(elId, option) {
        const el = document.getElementById(elId);
        if (!el) return;
        const chart = echarts.init(el);
        chart.setOption(Object.assign({
            textStyle: { fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', color: '#64748b' },
            grid: { left: 40, right: 16, top: 36, bottom: 28, containLabel: false },
        }, option));
        HX._charts.push(chart);
        window.addEventListener('resize', () => chart.resize());
        return chart;
    },

    // 色板
    colors: ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],

    // ---------- 页面骨架 ----------
    page(activeKey, title, subtitle, contentHtml, inSubDir = false) {
        document.body.innerHTML = `
        <div id="sidebar"></div>
        <div class="ml-60 min-h-screen bg-slate-50 flex flex-col">
            <div id="topbar"></div>
            <main class="flex-1 p-6">${contentHtml}</main>
        </div>`;
        HX.renderSidebar(activeKey);
        HX.renderTopbar(title, subtitle);
    },

    // ---------- Tab 切换 ----------
    initTabs(tabPrefix, panelPrefix, defaultIdx = 0, onChange) {
        const tabs = document.querySelectorAll(`[id^=${tabPrefix}]`);
        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => {
                tabs.forEach((t2, j) => {
                    t2.className = t2.className.replace(/bg-white text-indigo-600 border-indigo-200 shadow-sm/, 'text-slate-500 hover:text-slate-700')
                        .replace(/(^|\s)text-slate-500 hover:text-slate-700(\s|$)/, '$1text-slate-500 hover:text-slate-700$2');
                    const panel2 = document.getElementById(`${panelPrefix}${j}`);
                    if (panel2) panel2.classList.add('hidden');
                });
                tab.className = tab.className.replace('text-slate-500 hover:text-slate-700', 'bg-white text-indigo-600 border-indigo-200 shadow-sm');
                const panel = document.getElementById(`${panelPrefix}${i}`);
                if (panel) panel.classList.remove('hidden');
                if (onChange) onChange(i);
            });
        });
        // 默认激活
        if (defaultIdx > 0) tabs[defaultIdx] && tabs[defaultIdx].click();
    },

    // tab 条渲染
    renderTabs(tabs) {
        return `<div class="flex items-center gap-1 p-1 bg-slate-100/70 rounded-xl w-fit mb-4">
            ${tabs.map((t, i) => `
                <button id="tab-${t.key}" class="px-4 py-2 rounded-lg text-sm font-medium transition-all ${i === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">${t.label}</button>
            `).join('')}
        </div>`;
    },

    // ---------- 空状态 ----------
    emptyState(text = '暂无数据') {
        return `
        <div class="bg-white rounded-2xl border border-slate-200 py-16 flex flex-col items-center justify-center">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl text-slate-300">📭</div>
            <div class="mt-3 text-sm text-slate-400">${text}</div>
        </div>`;
    },
};
