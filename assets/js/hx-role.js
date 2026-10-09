/* =========================================================
 * HX_Dashboard hx-role.js — 四级角色系统（对齐 V9 模式）
 * 依赖：hx-data.js（HXD.UNITS）
 * 能力：具名角色档案 + owns 谓词 + 模块级「我的/全部」范围开关
 *       + 金色「我的范围」徽章 + 顶栏 roleSelect + 侧栏视角标签
 * ========================================================= */

const HX_ROLE = (() => {

    // ---------- 角色档案（具名演示角色，owns 谓词过滤学员单元） ----------
    const PROFILES = {
        manager: { key: 'manager', label: '管理者', name: '', avatar: '管', owns: () => true },
        subjectOwner: { key: 'subjectOwner', label: '学科负责人', name: '王语嫣', avatar: '科', owns: u => u.subjectLeader === '王语嫣' },
        gradeLeader: { key: 'gradeLeader', label: '年级组长', name: '高静宜', avatar: '年', owns: u => u.gradeLeader === '高静宜', lockMine: true },
        groupLeader: { key: 'groupLeader', label: '组长', name: '孙建军', avatar: '组', owns: u => u.groupLeader === '孙建军', lockMine: true },
    };
    const ORDER = ['manager', 'subjectOwner', 'gradeLeader', 'groupLeader'];

    // ---------- 状态 ----------
    let current = 'manager';
    const scopes = {};   // moduleId → 'mine' | 'all'
    const listeners = []; // 角色或某模块 scope 变化时回调（页面重渲染）

    function profile() { return PROFILES[current]; }
    function hasProfile() { return current !== 'manager'; }

    function set(role) {
        if (!PROFILES[role]) role = 'manager';
        current = role;
        // 切角色：scope 自动复位 mine（V9 模式）
        Object.keys(scopes).forEach(k => { scopes[k] = 'mine'; });
        notify();
    }
    function setScope(moduleId, scope) {
        if (!hasProfile() || profile().lockMine) return;   // 管理者无「我的」概念；锁定角色无视 setScope
        scopes[moduleId] = (scope === 'all') ? 'all' : 'mine';
        notify();
    }
    function getScope(moduleId) { return scopes[moduleId] || 'mine'; }

    function notify() {
        if (typeof HX !== 'undefined' && typeof HX.refreshChrome === 'function') HX.refreshChrome();
        listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    }
    function onChange(fn) { listeners.push(fn); }

    // ---------- 数据过滤 ----------
    function scopeUnits(units, moduleId) {
        const p = profile();
        if (!hasProfile() || (!p.lockMine && getScope(moduleId) === 'all')) return units;
        return units.filter(u => p.owns(u));
    }

    // ---------- UI 片段 ----------
    // 顶栏角色选择器
    function roleSelectHtml(id) {
        return `<select id="${id || 'hxRoleSelect'}" onchange="HX_ROLE.set(this.value)" aria-label="切换演示角色"
            class="border border-hxline rounded-lg px-2.5 py-1.5 text-[12px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-200">
            ${ORDER.map(k => `<option value="${k}" ${k === current ? 'selected' : ''}>${PROFILES[k].label}${PROFILES[k].name ? ' · ' + PROFILES[k].name : ''}</option>`).join('')}
        </select>`;
    }
    // 模块级范围开关（挂在各业务区块标题右侧）
    function scopeControlHtml(moduleId) {
        const p = profile();
        if (!hasProfile()) return '';
        if (p.lockMine) return `<span class="text-[11px] text-sub">${p.label} · ${p.name} · 本人范围</span>`;
        const mine = getScope(moduleId) === 'mine';
        return `<div class="flex items-center gap-2">
            <span class="text-[11px] text-sub">${p.label} · ${p.name}</span>
            <div class="hx-role-scope-switch" role="group" aria-label="数据范围">
                <button type="button" class="${mine ? 'active' : ''}" onclick="HX_ROLE.setScope('${moduleId}','mine')" aria-pressed="${mine}">★ 我的（含下级）</button>
                <button type="button" class="${!mine ? 'active' : ''}" onclick="HX_ROLE.setScope('${moduleId}','all')" aria-pressed="${!mine}">全部</button>
            </div>
        </div>`;
    }
    // 精简版范围开关（挂在 section 头部右侧，灵犀 V12 模式；仅学科负责人显示，不带姓名文字）
    function scopeSwitchHtml(moduleId) {
        const p = profile();
        if (!hasProfile() || p.lockMine) return '';
        const mine = getScope(moduleId) === 'mine';
        return `<div class="flex items-center gap-1.5">
            <span class="text-[10px] text-sub">数据范围</span>
            <div class="hx-role-scope-switch" role="group" aria-label="数据范围">
                <button type="button" class="${mine ? 'active' : ''}" onclick="HX_ROLE.setScope('${moduleId}','mine')" aria-pressed="${mine}">★ 我的</button>
                <button type="button" class="${!mine ? 'active' : ''}" onclick="HX_ROLE.setScope('${moduleId}','all')" aria-pressed="${!mine}">全部</button>
            </div>
        </div>`;
    }
    // scope=all 时的金色「我的范围」徽章（判断一组单元里是否含自己的）
    function ownedBadge(units) {
        if (!hasProfile() || units == null) return '';
        const p = profile();
        return units.some(u => p.owns(u)) ? '<em class="hx-owned-badge">我的范围</em>' : '';
    }
    // 判断当前行是否属于我的范围（scope=all 时高亮用）
    function isOwned(units) {
        if (!hasProfile()) return false;
        const p = profile();
        return units.some(u => p.owns(u));
    }
    // 侧栏底部视角标签（common.js renderSidebar 调用）
    function footHtml() {
        const p = profile();
        if (!p) return '当前视角：管理者<br>范围：全部基地业务';
        if (p.lockMine) return `当前视角：${p.label} · ${p.name}<br>范围：锁定本人及下级`;
        return `当前视角：${p.label} · ${p.name}<br>范围：以各模块开关为准（默认我的及下级）`;
    }
    // 顶栏头像 + 角色选择器组合
    function chromeHtml() {
        const p = profile();
        return `<div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">${p ? p.avatar : '管'}</div>
            ${roleSelectHtml()}
        </div>`;
    }

    return {
        PROFILES, ORDER,
        get current() { return current; },
        profile, hasProfile,
        set, setScope, getScope, onChange,
        scopeUnits, ownedBadge, isOwned,
        roleSelectHtml, scopeControlHtml, scopeSwitchHtml, footHtml, chromeHtml,
    };
})();
