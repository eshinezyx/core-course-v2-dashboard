/* =========================================================
 * HX_Dashboard hx-data.js — n/d pairs 数据基座 + 聚合引擎
 * 依赖：mock-data.js（TEACHERS/ORG/GROUPS/APP/GROUP_LEADERS）
 * 设计：SERVICE_UNITS（辅导×学员）为最小聚合单元，
 *       指标以 [分子,分母] 存储，任意维度组合加权聚合正确
 * 深参口径：深参率 = 深参人次 / 在班人次（到课人次，用户确认）
 * ========================================================= */

const HXD = (() => {

    // ---------- 确定性伪随机（独立种子，不干扰 v1） ----------
    let _s = 990302;
    function rnd() { _s = (_s * 9301 + 49297) % 233280; return _s / 233280; }
    function rr(min, max) { return min + rnd() * (max - min); }
    function chance(p) { return rnd() < p; }
    function fixed1(v) { return Math.round(v * 10) / 10; }
    const pct = (n, d) => (d > 0 ? n / d * 100 : null);

    // ---------- 年级组长（基地×年级，18人，跨学科） ----------
    const GRADE_LEADER_NAMES = [
        '顾清禾', '宋知远', '高静宜', '马跃然', '韩雪松', '邵明远',  // 保定 一~六年级
        '叶舒然', '陆明哲', '冯雅琴', '秦立群', '曹慧敏', '董建军',  // 沈阳 一~六年级
        '许嘉言', '温以宁', '谢文渊', '邹丽华', '石开泰', '廖俊卿',  // 长春 一~六年级
    ];
    const GRADE_LEADERS = [];
    ORG.bases.forEach((base, bi) => {
        ORG.grades.forEach((grade, gi) => {
            GRADE_LEADERS.push({
                name: GRADE_LEADER_NAMES[bi * ORG.grades.length + gi],
                base, grade,
                label: `${base} · ${grade}`,
            });
        });
    });
    const GRADE_LEADER_MAP = {};
    GRADE_LEADERS.forEach(g => { GRADE_LEADER_MAP[g.base + '|' + g.grade] = g.name; });

    // ---------- 讲次与日期轴 ----------
    const LECTURE_COUNT = 16;
    const LECTURE_DATES = Array.from({ length: LECTURE_COUNT }, (_, i) => {
        const d = new Date(2026, 8, 2 + i * 2);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });   // 每讲隔2天示意，月底后自然跨月
    const DAY_COUNT = 180;   // 一个学季约半年（2026-09-01 ~ 2027-02-27）
    const DAY_LABELS = Array.from({ length: DAY_COUNT }, (_, i) => {
        const d = new Date(2026, 8, 1 + i);
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // ---------- 服务链路阶段（管理员可配置，localStorage 持久化） ----------
    const FUNNEL_DEFAULT = [
        { key: 'ot', name: '开班期沟通', standard: 100, desc: '开班首周 1v1 覆盖全部学员' },
        { key: 'r1', name: '一轮覆盖', standard: 100, desc: '首次电话/深沟覆盖' },
        { key: 'r2', name: '二轮沟通', standard: 95, desc: '未覆盖与低意向二触' },
        { key: 'sv', name: '摸底', standard: 90, desc: '全量电话摸底 + 意向分级' },
    ];
    function loadFunnel() {
        try {
            const s = localStorage.getItem('hx_funnel_stages');
            if (s) return JSON.parse(s);
        } catch (e) { }
        return JSON.parse(JSON.stringify(FUNNEL_DEFAULT));
    }
    let FUNNEL_STAGES = loadFunnel();
    function saveFunnel(stages) {
        FUNNEL_STAGES = stages;
        try { localStorage.setItem('hx_funnel_stages', JSON.stringify(stages)); } catch (e) { }
    }

    // ---------- 小班会开课（组维度场次，日期在学季日轴内分布） ----------
    // 断层组/落后组等异常见下
    const LAGGARD_LEADER = '冯明辉';      // 沟通落后组（沈阳·数学）
    const FUNNEL_GAP_LEADER = '卫志远';   // 链路断层组（长春·数学）
    const GROUP_SESSIONS = {};        // groupLeader → [{idx, dayIdx}]
    GROUP_LEADERS.forEach((leader, gi) => {
        const n = Math.round(rr(14, 40) * 6);   // 半年学季保持日均场次密度
        GROUP_SESSIONS[leader] = Array.from({ length: n }, (_, k) => ({
            idx: k, dayIdx: Math.floor(rr(0, DAY_COUNT)),
        }));
    });

    // ---------- 生成 SERVICE_UNITS ----------
    // 每辅导的学员数用 v1 t.studentCount（80-220），当前 mock 总量约 1.17 万
    const UNITS = [];
    let uid = 0;
    TEACHERS.forEach((t, ti) => {
        const gl = GRADE_LEADER_MAP[t.base + '|' + t.grade] || GRADE_LEADERS[0].name;
        // 讲次级基础概率（从 v1 core 派生，保证跨页一致的人物画像）
        const attendP = t.core.attend / 100;
        // 目标差值（pp）：预警辅导 6~9，其余 -2~4；由差值反推深参条件概率，保证精确可控
        const targetDiff = t.isDiffAlert ? rr(6, 9) : rr(-2, 4);
        const deepP = Math.max(0.55, Math.min(0.98, t.core.submit / 100 - targetDiff / 100));
        const submitP = t.core.submit / 100;
        const correctP = t.core.correct / 100;
        const noteP = t.core.note / 100;
        // 沟通基础概率（从 v1 comm 派生）
        const replyP = t.comm.wechatReplyRate / 100;
        const deepCoverP = t.comm.deepCoverage / 100;      // 本期至少一次深沟的概率
        const deepPFinal = deepP;
        // 趋势下滑辅导（第6人）：到课随讲次衰减
        const isDeclining = (ti === 5);
        // 退费概率
        const refundP = t.isRefundAlert ? rr(5.5, 7.8) / 100 : (t.isRetainStar ? rr(0.3, 1.2) / 100 : rr(0.5, 4.5) / 100);
        // 老带新：线索概率（长春基地整体降低 → 末位）
        const baseFactor = t.base === '长春' ? 0.6 : 1;
        const leadP = rr(12, 36) / 100 * baseFactor;   // 学季半年，线索概率按同比扩量（总量约3000条）
        const convertP = (t.base === '长春' ? rr(12, 18) : rr(16, 32)) / 100;
        t._refundP = refundP; t._leadP = leadP; t._convertP = convertP;

        for (let k = 0; k < t.studentCount; k++) {
            const u = {
                id: 'U' + (++uid),
                teacherId: t.id,
                teacherName: t.shortName,
                base: t.base, subject: t.subject, grade: t.grade,
                subjectLeader: t.subjectLeader,
                gradeLeader: gl,
                groupLeader: t.groupLeader,
                isNew: k < t.newStudentCount,
                lessons: [],      // 16 × {at, dp, sb, cr, nt}（二值）
                days: [],         // 180 × {rd, rt, dp}
                meetings: [],     // 参与的组场次 [{i, m}]
                funnel: null,     // {ot, r1, r2, sv}
            };
            // —— 讲次对 ——
            for (let l = 0; l < LECTURE_COUNT; l++) {
                let aP = attendP;
                if (isDeclining) aP = Math.max(0.5, attendP - l * 0.028);      // 逐讲下滑
                if (t.isDiffAlert && (l === 5 || l === 10)) aP = Math.max(0.55, aP - 0.12);
                const at = chance(aP) ? 1 : 0;
                const dp = at && chance(deepPFinal) ? 1 : 0;
                const sb = chance(submitP) ? 1 : 0;
                const cr = sb && chance(correctP) ? 1 : 0;
                const nt = at && chance(noteP) ? 1 : 0;
                u.lessons.push({ at, dp, sb, cr, nt });
            }
            // —— 日轴沟通 ——
            let deepLeft = chance(deepCoverP) ? 1 + (chance(0.35) ? 1 : 0) : 0;   // 本期深沟次数（覆盖者1-2次）
            for (let d = 0; d < DAY_COUNT; d++) {
                const rd = chance(0.25) ? (chance(0.4) ? 2 : 1) : 0;             // 每日应回复条数
                const rt = rd > 0 ? (chance(replyP) ? rd : Math.max(0, rd - 1)) : 0;
                let dp = 0;
                if (deepLeft > 0 && chance(0.12)) { dp = 1; deepLeft--; }
                u.days.push({ rd, rt, dp });
            }
            // —— 小班会参与（组内场次的子集） ——
            const sessions = GROUP_SESSIONS[t.groupLeader];
            const attendMeetingP = rr(0.5, 0.85);
            sessions.forEach(s => {
                if (chance(attendMeetingP)) {
                    u.meetings.push({ i: s.idx, m: chance(0.78) ? Math.round(rr(21, 50)) : Math.round(rr(5, 19)) });
                }
            });
            // —— 服务链路阶段覆盖 ——
            let otP = 0.96, r1P = 0.91, r2P = 0.87, svP = 0.76;
            if (t.groupLeader === LAGGARD_LEADER) { otP = 0.88; r1P = 0.78; r2P = 0.70; svP = 0.58; }
            if (t.groupLeader === FUNNEL_GAP_LEADER) { r2P = 0.62; svP = 0.45; }      // 断层
            u.funnel = {
                ot: chance(otP) ? 1 : 0,
                r1: chance(r1P) ? 1 : 0,
                r2: chance(r1P) ? (chance(r2P / r1P) ? 1 : 0) : 0,              // 二轮以前一轮为前提
                sv: chance(svP) ? 1 : 0,
            };
            UNITS.push(u);
        }
    });

    // ---------- 事件表 ----------
    // 退费事件（每 unit 至多1条；stage 按 2026-09-02 首讲前后7天=开班期）
    const REFUND_REASONS = ['效果不及预期', '时间冲突', '价格因素', '学生自觉性差', '家长更换机构', '其他'];
    const REFUND_EVENTS = [];   // {u, stage, retained, reason, dayIdx}
    UNITS.forEach(u => {
        const t = TEACHERS.find(x => x.id === u.teacherId);
        if (chance(t._refundP)) {
            const r = rnd();
            const stage = r < 0.3 ? 'open' : (r < 0.75 ? 'ongoing' : 'after');
            REFUND_EVENTS.push({
                u: u.id,
                stage,
                retained: t.isRetainStar ? (chance(0.9) ? 1 : 0) : (chance(0.42) ? 1 : 0),
                reason: REFUND_REASONS[Math.floor(rnd() * REFUND_REASONS.length)],
                dayIdx: stage === 'open' ? Math.floor(rr(0, 8)) : Math.floor(rr(8, DAY_COUNT)),
                isNew: u.isNew,
            });
        }
    });
    // 老带新线索明细表（每条线索：老生推荐新生 → 归属辅导线索池 → 转化/释放流转）
    const _pick = arr => arr[Math.floor(rnd() * arr.length)];
    const _GRADE_POOL = ['三年级', '四年级', '五年级', '六年级'];
    const _SUBJECT_POOL = ['语文', '数学', '英语'];
    const PERIOD_RANGE = { 1: [0, 59], 2: [60, 119], 3: [120, 179] };   // 课程期次 → 服务日范围（学季约半年均分3期，每期约2个月：第1期09-01~10-30 / 第2期10-31~12-29 / 第3期12-30~02-27）
    const _INTENT_POOL = () => { const r = rnd(); return r < 0.10 ? '无' : (r < 0.35 ? '低' : (r < 0.65 ? '中' : (r < 0.90 ? '高' : '准'))); };   // 意向程度五级（无/低/中/高/准）
    const _ORDER_NAME_POOL = ['【26秋】六年级语文领航班', '【26秋】初一数学突破班', '【26暑】新初一英语衔接班', '【26秋】初二物理提高班', '【26秋】五年级数学思维班'];
    const _RELEASE_CAUSE = () => { const r = rnd(); return r < 0.65 ? '超时未跟进释放' : (r < 0.95 ? '超时未转化释放' : '辅导手动释放'); };
    const _USED_NAMES = new Set();
    let _newSeq = 0, _ordSeq = 0;
    const REFERRAL_LEADS = [];
    UNITS.forEach(u => {
        const t = TEACHERS.find(x => x.id === u.teacherId);
        if (!chance(t._leadP)) return;
        // 老生姓名（惰性赋值，序号后缀避免姓名池耗尽）
        if (!u.stuName) {
            u.stuName = _pick(_surnames) + _pick(_given) + String(++_newSeq % 10);
        }
        const n = chance(0.22) ? 2 : 1;   // 22% 一名推荐人带来 2 个新生
        for (let k = 0; k < n; k++) {
            const leadDay = Math.floor(rr(0, DAY_COUNT));          // 线索生成时间
            const cycle = [1, 2, 3].find(p => leadDay >= PERIOD_RANGE[p][0] && leadDay <= PERIOD_RANGE[p][1]) || 1;   // 归属课程期次（按 PERIOD_RANGE 查表，与区间同源）
            // 来源：老生带来（70%）→ 老生姓名+老生ID；辅导自拓（30%）→ 辅导姓名+辅导ID
            const broughtBy = chance(0.7) ? '老生' : '辅导';
            const lead = {
                id: 'L' + (1001 + REFERRAL_LEADS.length),
                referrerUnitId: u.id,
                referrerName: broughtBy === '老生' ? u.stuName : t.shortName,
                referrerId: broughtBy === '老生' ? u.id : t.id,
                ownerTeacherName: t.shortName, ownerTeacherId: t.id,    // 归属辅导（线索池归属，与来源正交）
                broughtBy,
                newStudentName: null, newStudentId: 'S' + (92001 + REFERRAL_LEADS.length),      // 下面生成姓名
                cycle, leadDay,
                intentGrade: _pick(_GRADE_POOL), intentSubject: _pick(_SUBJECT_POOL),
                intentLevel: _INTENT_POOL(),
                allotDay: null,            // 线索分配时间（分配入辅导线索池）
                holdDeadline: null,        // 保有截止日（超时未转化自动释放；仅对在库线索有意义）
                releaseCause: null,        // 释放原因（仅已释放线索）
                releaseDay: null,         // 释放发生日（仅已释放线索）
                status: '', dealDay: null, price: null, orders: null, followLog: [],
            };
            let nm2;
            do { nm2 = _pick(_surnames) + _pick(_given) + String(++_newSeq % 10); } while (_USED_NAMES.has(nm2));
            _USED_NAMES.add(nm2);
            lead.newStudentName = nm2;
            lead.allotDay = Math.min(DAY_COUNT - 1, leadDay + Math.floor(rr(0, 3)));
            if (chance(t._convertP)) {
                lead.status = '已转化';
                // 成单＝订单数（一个新生可购多单：68%一单 / 24%两单 / 8%三单）
                const nOrd = rnd() < 0.68 ? 1 : (rnd() < 0.75 ? 2 : 3);
                lead.orders = [];
                for (let i = 0; i < nOrd; i++) {
                    const day = Math.min(DAY_COUNT - 1, leadDay + Math.floor(rr(0, 6)) + (i > 0 ? i + Math.floor(rr(0, 3)) : 0));
                    const originalPrice = Math.round(rr(2200, 9800));
                    const payPrice = Math.round(originalPrice * (rr(0.7, 1.0)));
                    const lessons = _pick([12, 16, 20, 24]);
                    const refunded = chance(0.12);
                    lead.orders.push({
                        day, orderId: 'O' + (90001 + (_ordSeq++)),
                        name: _pick(_ORDER_NAME_POOL),
                        biz: chance(0.78) ? '恒行' : (chance(0.7) ? '锦书' : '晓狐'),
                        mode: chance(0.7) ? '单师' : '双师',
                        originalPrice, payPrice,
                        refund: refunded ? Math.round(payPrice * rr(0.3, 1.0)) : 0,
                        lessons, completed: refunded ? Math.floor(lessons * rr(0, 0.3)) : Math.min(lessons, Math.floor(lessons * rr(0.3, 1.0) + 1)),
                    });
                }
                lead.dealDay = lead.orders[0].day;      // 兼容字段：首单日
                lead.price = lead.orders.reduce((s, o) => s + o.payPrice, 0);   // 兼容字段：累计实付
                for (let f = 0; f <= Math.floor(rr(1, 3)); f++) {
                    lead.followLog.push({ day: leadDay + f, by: t.shortName, text: _pick(['电话沟通意向课程', '发送试听链接', '微信跟进优惠活动', '介绍长期班课程体系']) });
                }
            } else {
                const ago = DAY_COUNT - 1 - leadDay;
                const r = rnd();
                if (ago <= 2) lead.status = (r < 0.7) ? '待跟进' : '跟进中';
                else lead.status = (r < 0.45) ? '跟进中' : (r < 0.63 ? '待跟进' : '已释放');
                if (lead.status === '已释放') {
                    lead.releaseCause = _RELEASE_CAUSE();
                    lead.releaseDay = Math.min(DAY_COUNT - 1, leadDay + (lead.releaseCause === '辅导手动释放' ? 5 : 3));   // 释放发生日（超时类=生成后3日 / 手动=5日）
                    lead.followLog.push({
                        day: lead.releaseDay, by: '系统',
                        text: lead.releaseCause === '超时未跟进释放' ? '线索超时未跟进，自动释放至公海'
                            : (lead.releaseCause === '超时未转化释放' ? '线索跟进后未转化，超时释放至公海' : '辅导手动释放线索至公海'),
                    });
                    if (lead.status !== '待跟进') lead.followLog.unshift({ day: leadDay, by: t.shortName, text: _pick(['电话沟通未接听', '微信已发送活动介绍', '预约试听时间']) });
                } else {
                    // 在库线索：保有截止日在未来；约15%为临近超时（剩余≤1天，风险样本）
                    lead.holdDeadline = (DAY_COUNT - 1) + (chance(0.15) ? 1 : Math.floor(rr(2, 5)));
                    if (lead.status !== '待跟进') {
                        lead.followLog.push({ day: leadDay, by: t.shortName, text: _pick(['电话沟通未接听', '微信已发送活动介绍', '预约试听时间']) });
                    }
                }
            }
            REFERRAL_LEADS.push(lead);
        }
    });

    // ---------- 指标注册表 ----------
    // better: higher|lower；rate: 是否百分比；sampleMin: 样本门槛
    const METRICS = {
        // —— 核心课 ——
        attend: { name: '到课率', short: '到课', color: '#165dff', group: 'core', better: 'higher', rate: true, formula: '到课人次 ÷ 应到人次（班内学员 × 已结束讲次）', num: a => pct(a.attendN, a.attendD) },
        deep: { name: '深参率', short: '深参', color: '#13c2c2', group: 'core', better: 'higher', rate: true, formula: '深参人次 ÷ 在班人次（听课时长≥80%正课时长；分母为到课人次）', num: a => pct(a.deepN, a.deepD) },
        submit: { name: '作业提交率', short: '提交', color: '#6857e5', group: 'core', better: 'higher', rate: true, formula: '提交人次 ÷ 应提交人次', num: a => pct(a.submitN, a.submitD) },
        diff: { name: '差值', short: '差值', color: '#d96b43', group: 'core', better: 'lower', rate: true, derived: true, formula: '作业提交率 − 深参率（提交率高但到课者听课浅 → 需复盘）', num: a => (a.submitD > 0 && a.deepD > 0) ? (a.submitN / a.submitD * 100 - a.deepN / a.deepD * 100) : null },
        correct: { name: '作业正确率', short: '正确', color: '#22c55e', group: 'core', better: 'higher', rate: true, formula: '正确提交人次 ÷ 提交人次', num: a => pct(a.correctN, a.correctD) },
        note: { name: '笔记提交率', short: '笔记', color: '#8b5cf6', group: 'core', better: 'higher', rate: true, formula: '笔记提交人次 ÷ 到课人次', num: a => pct(a.noteN, a.noteD) },
        // —— 沟通 ——
        replyRate: { name: '企微回复率', short: '回复', color: '#165dff', group: 'comm', better: 'higher', rate: true, formula: '15分钟内回复条数 ÷ 学员发来消息条数（T+1数据·更新至昨日；按辅导维度聚合，含私聊/群聊）', num: a => pct(a.replyTimely, a.replyDue) },
        replyDue: { name: '应回复量', short: '应答', color: '#5b8ff9', group: 'comm', better: 'higher', rate: false, formula: '窗口内应回复消息条数', num: a => a.replyDue },
        deepCoverRate: { name: '深沟覆盖率', short: '深沟', color: '#13c2c2', group: 'comm', better: 'higher', rate: true, formula: '窗口内有深沟动作的学员数 ÷ 学员总数（深沟＝企微电话/系统电话/小班会1V1 任一时长≥10分钟）', num: a => pct(a.deepCovered, a.unitCount) },
        deepCount: { name: '深沟次数', short: '深沟量', color: '#0e9f9f', group: 'comm', better: 'higher', rate: false, formula: '窗口内深沟动作总次数（企微电话/系统电话/小班会1V1 任一≥10分钟计1次）', num: a => a.deepCount },
        meetingAttend: { name: '小班会参课率', short: '参课', color: '#6857e5', group: 'comm', better: 'higher', rate: true, formula: '参与≥20分钟人次 ÷ 应到人次（本期全部场次）', num: a => pct(a.meetingAttN, a.meetingPairD) },
        meetingCover: { name: '小班会覆盖率', short: '覆盖', color: '#8b5cf6', group: 'comm', better: 'higher', rate: true, formula: '本期至少参与1次（≥20min）的学员 ÷ 学员总数', num: a => pct(a.meetingCovered, a.unitCount) },
        // —— 退费（better: lower） ——
        refundRate: { name: '总退费率', short: '退费', color: '#ef4444', group: 'refund', better: 'lower', rate: true, formula: '退费学员数 ÷ 班内学员数（当前阶段窗口）', num: a => pct(a.refundUnits, a.unitCount) },
        refundFresh: { name: '新生退费率', short: '新生', color: '#f97316', group: 'refund', better: 'lower', rate: true, formula: '新生退费学员 ÷ 新生总数', num: a => pct(a.refundFreshN, a.freshCount) },
        refundOld: { name: '老生退费率', short: '老生', color: '#f59e0b', group: 'refund', better: 'lower', rate: true, formula: '老生退费学员 ÷ 老生总数', num: a => pct(a.refundOldN, a.oldCount) },
        retainRate: { name: '挽单率', short: '挽单', color: '#22c55e', group: 'refund', better: 'higher', rate: true, formula: '挽单成功数 ÷ 退费申请数', num: a => pct(a.retainedN, a.refundUnits) },
        // —— 老带新 ——
        leads: { name: '新增线索', short: '线索', color: '#165dff', group: 'referral', better: 'higher', rate: false, formula: '窗口内新增老带新线索数', num: a => a.leads },
        inStock: { name: '在库线索', short: '在库', color: '#13c2c2', group: 'referral', better: 'higher', rate: false, formula: '当前在库线索总量（待跟进+跟进中；时点值，仅随期次筛选变化，不受时间窗口影响）', num: a => a.inStock },
        deals: { name: '成单数', short: '成单', color: '#22c55e', group: 'referral', better: 'higher', rate: false, formula: '窗口内成单订单数（一个新生可购多单，按订单计）', num: a => a.deals },
        convertRate: { name: '转化率', short: '转化', color: '#d96b43', group: 'referral', better: 'higher', rate: true, formula: '当期成单人数 ÷ 当期新增线索数（人头口径，一人多单只计1人；分母含已释放线索）', num: a => pct(a.dealPersons, a.leads) },
        riskCount: { name: '超保有风险', short: '超保有', color: '#ef4444', group: 'referral', better: 'lower', rate: false, formula: '窗口内新增线索中，剩余保有时间≤1天的在库线索数（待跟进+跟进中，临近超时释放）', num: a => a.riskCount },
        releaseRate: { name: '释放率', short: '释放率', color: '#94a3b8', group: 'referral', better: 'lower', rate: true, formula: '窗口内已释放线索 ÷ 窗口内新增线索数（线索流失占比，越低越好）', num: a => pct(a.releaseCount, a.leads) },
        // —— 老带新 v2 口径（referral-v2.html 专用；总线索=全量所有状态、转化率=累计人头÷总线索） ——
        inStockAll: { name: '总线索', short: '总线索', color: '#13c2c2', group: 'referral', better: 'higher', rate: false, formula: '期次内全量线索总数（待跟进+跟进中+已转化+已释放；累计值，仅随期次筛选变化，不受时间窗口影响）', num: a => a.allLeads },
        convertRateCum: { name: '转化率', short: '转化', color: '#d96b43', group: 'referral', better: 'higher', rate: true, formula: '期次内已下单线索数（人头，累计）÷ 总线索数（全量）；不受时间窗口影响。正价课与单双师口径待业务确认，当前订单全量计入', num: a => pct(a.convLeads, a.allLeads) },
    };

    // ---------- 聚合引擎 ----------
    // opt: { lectures: Set<number>|null(全部), dayFrom, dayTo, stage: 'open'|'ongoing'|'after'|'all' }
    function agg(units, opt) {
        opt = opt || {};
        const lectures = opt.lectures || null;
        const dFrom = opt.dayFrom != null ? opt.dayFrom : 0;
        const dTo = opt.dayTo != null ? opt.dayTo : DAY_COUNT - 1;
        const stage = opt.stage || 'all';
        const cyc = opt.cycles || null;   // 老带新活动期次集合（空=不过滤）
        const a = {
            unitCount: 0, freshCount: 0, oldCount: 0,
            attendN: 0, attendD: 0, deepN: 0, deepD: 0, submitN: 0, submitD: 0,
            correctN: 0, correctD: 0, noteN: 0, noteD: 0,
            replyDue: 0, replyTimely: 0, deepCount: 0, deepCovered: 0,
            meetingAttN: 0, meetingPairD: 0, meetingCovered: 0,
            refundUnits: 0, refundFreshN: 0, refundOldN: 0, retainedN: 0,
            leads: 0, deals: 0, dealPersons: 0, releaseCount: 0, riskCount: 0, inStock: 0, inStockWait: 0, inStockDoing: 0, allLeads: 0, convLeads: 0, allConverted: 0, allReleased: 0,
        };
        const refundSet = new Set(STAGE_FILTER(stage));
        for (const u of units) {
            a.unitCount++;
            if (u.isNew) a.freshCount++; else a.oldCount++;
            // 讲次对
            for (let l = 0; l < u.lessons.length; l++) {
                if (lectures && !lectures.has(l + 1)) continue;
                const L = u.lessons[l];
                a.attendD += 1; a.attendN += L.at;
                a.deepD += L.at; a.deepN += L.dp;
                a.submitD += 1; a.submitN += L.sb;
                a.correctD += L.sb; a.correctN += L.cr;
                a.noteD += L.at; a.noteN += L.nt;
            }
            // 日轴
            let deepHit = false;
            for (let d = dFrom; d <= dTo; d++) {
                const D = u.days[d];
                a.replyDue += D.rd; a.replyTimely += D.rt;
                if (D.dp) { a.deepCount += D.dp; deepHit = true; }
            }
            if (deepHit) a.deepCovered++;
            // 小班会（本期全部场次）
            if (u.meetings.length) {
                let covHit = false;
                for (const m of u.meetings) {
                    a.meetingPairD += 1;
                    if (m.m >= 20) { a.meetingAttN += 1; covHit = true; }
                }
                if (covHit) a.meetingCovered++;
            }
            // 退费（事件表反查）
            const ev = REFUND_INDEX[u.id];
            if (ev && refundSet.has(ev.stage)) {
                a.refundUnits++;
                if (ev.isNew) a.refundFreshN++; else a.refundOldN++;
                if (ev.retained) a.retainedN++;
            }
            // 老带新（线索明细表；opt.cycles＝活动期过滤，空/缺省=不过滤）
            const leads = (opt.leadsByUnit || REFERRAL_LEADS_BY_UNIT)[u.id];
            if (leads) for (const l of leads) {
                if (cyc && !cyc.has(String(l.cycle))) continue;
                // v2 累计口径（referral-v2.html）：全量线索（所有状态）、状态分解、累计转化人头（有任一订单）
                a.allLeads++;
                if (l.status === '已转化') a.allConverted++;
                if (l.status === '已释放') a.allReleased++;
                if ((l.orders || []).length) a.convLeads++;
                // 在库线索＝时点总量（待跟进+跟进中；仅期次过滤，不受时间窗口影响）
                if (l.status === '待跟进' || l.status === '跟进中') {
                    a.inStock++;
                    if (l.status === '待跟进') a.inStockWait++; else a.inStockDoing++;
                }
                if (l.leadDay >= dFrom && l.leadDay <= dTo) {
                    a.leads++;
                    if (l.status === '已释放') a.releaseCount++;
                    // 超保有风险＝时点快照：在库且剩余保有≤1天（holdDeadline 以 DAY_COUNT-1 为当前日）
                    if ((l.status === '待跟进' || l.status === '跟进中') && (l.holdDeadline - (DAY_COUNT - 1)) <= 1) a.riskCount++;
                }
                // 成单：订单数口径（一人可多单）；转化率分子＝成单人数（人头）
                const inWin = (l.orders || []).filter(o => o.day >= dFrom && o.day <= dTo);
                if (inWin.length) {
                    a.dealPersons++;
                    a.deals += inWin.length;
                }
            }
        }
        return a;
        function STAGE_FILTER(st) {
            if (st === 'all') return ['open', 'ongoing', 'after'];
            return [st];
        }
    }
    // 索引（unitId → 事件）
    const REFUND_INDEX = {};
    REFUND_EVENTS.forEach(e => { REFUND_INDEX[e.u] = e; });
    const REFERRAL_LEADS_BY_UNIT = {};
    REFERRAL_LEADS.forEach(l => {
        (REFERRAL_LEADS_BY_UNIT[l.referrerUnitId] || (REFERRAL_LEADS_BY_UNIT[l.referrerUnitId] = [])).push(l);
    });

    // ---------- 26暑学季（07-01 ~ 08-31，62天）：独立伪随机，不干扰 26秋 ----------
    let _ss = 20260701;
    const srnd = () => { _ss = (_ss * 9301 + 49297) % 233280; return _ss / 233280; };
    const srr = (min, max) => min + srnd() * (max - min);
    const schance = p => srnd() < p;
    const sPick = arr => arr[Math.floor(rnd() * arr.length)];

    // 26暑日期轴（07-01 ~ 08-31，62天）
    const SUMMER_DAY_COUNT = 62;
    const SUMMER_DAY_LABELS = Array.from({ length: SUMMER_DAY_COUNT }, (_, i) => {
        const d = new Date(2026, 6, 1 + i);
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // 26暑期次范围：暑1期 07-01~07-21（0-20）｜暑2期 07-22~08-11（21-41）｜暑3期 08-12~08-31（42-61）
    const SUMMER_PERIOD_RANGE = { 1: [0, 20], 2: [21, 41], 3: [42, 61] };

    // 26暑辅导池：从79人中确定性选择约65%（51人），保证每个基地×学科至少1人
    const SUMMER_TEACHERS = (() => {
        const groups = {};
        TEACHERS.forEach(t => { const k = t.base + '|' + t.subject; (groups[k] = groups[k] || []).push(t); });
        const picked = [];
        Object.values(groups).forEach(g => {
            const sel = g.filter(() => srnd() < 0.65);
            if (!sel.length) sel.push(g[0]);
            picked.push(...sel);
        });
        return picked;
    })();
    SUMMER_TEACHERS.forEach(t => { t._summerLeadP = srr(12, 36) / 100 * (t.base === '长春' ? 0.6 : 1); });

    // 26暑学员单元：每辅导带约30-60名暑期学员（老带新页仅用线索数据；lessons/days/meetings 为空结构，保证共享 agg 引擎不崩溃且课服类指标为 0）
    const SUMMER_UNITS = [];
    let _suid = 0;
    SUMMER_TEACHERS.forEach(t => {
        const n = Math.round(srr(30, 60));
        for (let k = 0; k < n; k++) {
            SUMMER_UNITS.push({ id: 'SU' + (++_suid), teacherId: t.id, teacherName: t.shortName, base: t.base, subject: t.subject, grade: t.grade, groupLeader: t.groupLeader, subjectLeader: t.subjectLeader, isNew: false, lessons: [], days: Array.from({ length: SUMMER_DAY_COUNT }, () => ({ rd: 0, rt: 0, dp: 0 })), meetings: [] });
        }
    });
    const SUMMER_REFERRAL_LEADS_BY_UNIT = {};
    SUMMER_UNITS.forEach(u => {
        const t = SUMMER_TEACHERS.find(x => x.id === u.teacherId);
        if (!schance(t._summerLeadP)) return;
        const n = schance(0.22) ? 2 : 1;
        for (let k = 0; k < n; k++) {
            const leadDay = Math.floor(srr(0, SUMMER_DAY_COUNT));
            const cycle = [1, 2, 3].find(p => leadDay >= SUMMER_PERIOD_RANGE[p][0] && leadDay <= SUMMER_PERIOD_RANGE[p][1]) || 1;
            const broughtBy = srnd() < 0.7 ? '老生' : '辅导';
            let nm2;
            do { nm2 = sPick(_surnames) + sPick(_given) + String(Math.floor(srnd() * 10)); } while (Object.values(SUMMER_REFERRAL_LEADS_BY_UNIT).flat().some(l => l.newStudentName === nm2));
            const lead = {
                id: 'SL' + (1001 + SUMMER_REFERRAL_LEADS_BY_UNIT[u.id] ? 0 : 0), // 下面统一改
                referrerUnitId: u.id,
                referrerName: broughtBy === '老生' ? (u.stuName || (u.stuName = sPick(_surnames) + sPick(_given))) : t.shortName,
                referrerId: broughtBy === '老生' ? u.id : t.id,
                ownerTeacherName: t.shortName,
                ownerTeacherId: t.id,
                broughtBy,
                newStudentName: nm2,
                newStudentId: 'SS' + (++_suid),
                cycle, leadDay,
                intentGrade: sPick(['三年级', '四年级', '五年级', '六年级']),
                intentSubject: sPick(['语文', '数学', '英语']),
                intentLevel: (r => r < 0.10 ? '无' : r < 0.35 ? '低' : r < 0.65 ? '中' : r < 0.90 ? '高' : '准')(srnd()),
                allotDay: null, holdDeadline: null,
                releaseCause: null, releaseDay: null,
                status: '', dealDay: null, price: null, orders: null,
            };
            lead.allotDay = Math.min(SUMMER_DAY_COUNT - 1, leadDay + Math.floor(srr(0, 3)));
            if (schance(srr(16, 32) / 100)) {
                lead.status = '已转化';
                const nOrd = srnd() < 0.68 ? 1 : (rnd() < 0.75 ? 2 : 3);
                lead.orders = [];
                for (let i = 0; i < nOrd; i++) {
                    const originalPrice = Math.round(srr(2200, 9800));
                    const payPrice = Math.round(originalPrice * (srnd() < 0.78 ? 0.85 : 1.0));
                    const day = Math.min(SUMMER_DAY_COUNT - 1, leadDay + Math.floor(srr(0, 6)) + (i > 0 ? i + Math.floor(srr(0, 3)) : 0));
                    lead.orders.push({ day, orderId: 'SO' + (++_suid), name: sPick(['【26暑】六年级语文领航班', '【26暑】初一数学衔接班', '【26暑】新初三英语提高班']), biz: srnd() < 0.78 ? '恒行' : (rnd() < 0.7 ? '锦书' : '晓狐'), mode: srnd() < 0.7 ? '单师' : '双师', originalPrice, payPrice, refund: 0, lessons: 12, completed: 0 });
                }
                lead.dealDay = lead.orders[0].day;
                lead.price = lead.orders.reduce((s, o) => s + o.payPrice, 0);
            } else {
                const ago = SUMMER_DAY_COUNT - 1 - leadDay;
                const r = srnd();
                if (ago <= 2) lead.status = r < 0.7 ? '待跟进' : '跟进中';
                else lead.status = r < 0.45 ? '待跟进' : (r < 0.85 ? '跟进中' : '已释放');
                if (lead.status === '已释放') {
                    lead.releaseCause = srnd() < 0.65 ? '超时未跟进释放' : (rnd() < 0.75 ? '超时未转化释放' : '辅导手动释放');
                    lead.releaseDay = Math.min(SUMMER_DAY_COUNT - 1, leadDay + (lead.releaseCause === '辅导手动释放' ? 5 : 3));
                } else {
                    lead.holdDeadline = SUMMER_DAY_COUNT - 1 + (srnd() < 0.15 ? 1 : Math.floor(srr(2, 5)));
                }
            }
            (SUMMER_REFERRAL_LEADS_BY_UNIT[u.id] = SUMMER_REFERRAL_LEADS_BY_UNIT[u.id] || []).push(lead);
        }
    });
    const SUMMER_REFERRAL_LEADS = Object.values(SUMMER_REFERRAL_LEADS_BY_UNIT).flat();
    SUMMER_REFERRAL_LEADS.forEach((l, i) => { l.id = 'SL' + (1001 + i); });

    // 学季汇总结构：referral-v2.html 通过 SEASON_DATA[season] 获取对应学季数据
    const SEASON_DATA = {
        autumn: { key: 'autumn', label: '26秋', dayCount: DAY_COUNT, dayLabels: DAY_LABELS, periodRange: PERIOD_RANGE, periodNames: ['第1期', '第2期', '第3期'], defaultPeriods: ['1', '2', '3'], teachers: TEACHERS, units: UNITS, referralLeads: REFERRAL_LEADS, referralLeadsByUnit: REFERRAL_LEADS_BY_UNIT },
        summer: { key: 'summer', label: '26暑', dayCount: SUMMER_DAY_COUNT, dayLabels: SUMMER_DAY_LABELS, periodRange: SUMMER_PERIOD_RANGE, periodNames: ['暑1期', '暑2期', '暑3期'], defaultPeriods: ['3'], teachers: SUMMER_TEACHERS, units: SUMMER_UNITS, referralLeads: SUMMER_REFERRAL_LEADS, referralLeadsByUnit: SUMMER_REFERRAL_LEADS_BY_UNIT },
    };

    // ---------- 维度系统 ----------
    const DIMENSIONS = [
        { key: 'base', name: '基地' },
        { key: 'subject', name: '学科' },
        { key: 'grade', name: '年级' },
        { key: 'subjectLeader', name: '学科负责人' },
        { key: 'gradeLeader', name: '年级组长' },
        { key: 'groupLeader', name: '组长' },
        { key: 'teacherName', name: '辅导' },
        { key: 'isNewDim', name: '新老生', valueOf: u => u.isNew ? '新生' : '老生' },
    ];
    function dimValue(u, dimKey) {
        if (dimKey === 'isNewDim') return u.isNew ? '新生' : '老生';
        return u[dimKey];
    }

    // 组合树：递归分组
    function levelTree(units, dims, opt) {
        function build(list, depth) {
            if (depth >= dims.length) return [];
            const key = dims[depth];
            const map = {};
            list.forEach(u => {
                const v = dimValue(u, key);
                (map[v] || (map[v] = [])).push(u);
            });
            return Object.keys(map).map(name => {
                const children = build(map[name], depth + 1);
                return { key, name, units: map[name], children };
            }).sort((x, y) => x.name.localeCompare(y.name, 'zh-CN'));
        }
        return build(units, 0);
    }

    // ---------- 同级分位四档 ----------
    function rankLevel(values, value, better) {
        if (value == null || !values.length) return { level: 'normal', label: '暂无', rank: null, count: values.length };
        const sorted = values.slice().sort((a, b) => better === 'lower' ? a - b : b - a);
        const rank = sorted.indexOf(value) + 1;
        const count = sorted.length;
        const top = rank / count * 100;
        const bottom = (count - rank + 1) / count * 100;
        if (top <= 25) return { level: 'lead', label: '领先', rank, count };
        if (bottom <= 25) return { level: 'risk', label: '需关注', rank, count };
        if (bottom <= 40) return { level: 'low', label: '偏低', rank, count };
        return { level: 'normal', label: '正常', rank, count };
    }
    function positionText(rank, count) {
        if (rank == null || !count) return '—';
        const p = Math.ceil(rank / count * 4);
        return ['前 25%', '前 50%', '后 50%', '后 25%'][Math.min(3, p - 1)] + ` · ${rank}/${count}`;
    }

    // ---------- 趋势 ----------
    function lectureTrend(units, metricKey, opt) {
        opt = opt || {};
        const out = [];
        for (let l = 1; l <= LECTURE_COUNT; l++) {
            const a = agg(units, Object.assign({}, opt, { lectures: new Set([l]) }));
            out.push({ lecture: l, date: LECTURE_DATES[l - 1], value: METRICS[metricKey].num(a) });
        }
        return out;
    }
    function dayTrend(units, metricKey, opt) {
        opt = opt || {};
        const out = [];
        for (let d = 0; d < DAY_COUNT; d++) {
            const a = agg(units, Object.assign({}, opt, { dayFrom: d, dayTo: d }));
            out.push({ dayIdx: d, label: DAY_LABELS[d], value: METRICS[metricKey].num(a) });
        }
        return out;
    }

    // ---------- 维度链预设持久化（≤3 条） ----------
    const CHAIN_STORE_KEY = 'hx_dim_chains';
    function loadChains() {
        try { return JSON.parse(localStorage.getItem(CHAIN_STORE_KEY)) || []; } catch (e) { return []; }
    }
    function saveChain(name, dims) {
        const chains = loadChains().filter(c => c.name !== name);
        chains.push({ name, dims });
        while (chains.length > 3) chains.shift();
        try { localStorage.setItem(CHAIN_STORE_KEY, JSON.stringify(chains)); } catch (e) { }
        return loadChains();
    }
    function deleteChain(name) {
        const chains = loadChains().filter(c => c.name !== name);
        try { localStorage.setItem(CHAIN_STORE_KEY, JSON.stringify(chains)); } catch (e) { }
        return loadChains();
    }

    // ---------- 组会开课次数（组维度，非学员聚合） ----------
    function groupOpenCount(units, opt) {
        opt = opt || {};
        const dFrom = opt.dayFrom != null ? opt.dayFrom : 0;
        const dTo = opt.dayTo != null ? opt.dayTo : DAY_COUNT - 1;
        const leaders = new Set(units.map(u => u.groupLeader));
        let n = 0;
        leaders.forEach(ld => {
            (GROUP_SESSIONS[ld] || []).forEach(s => { if (s.dayIdx >= dFrom && s.dayIdx <= dTo) n++; });
        });
        return n;
    }

    // ---------- sanity 自检（console） ----------
    function sanity() {
        const S = [];
        // 1. 加权聚合 == 全量直算
        const full = agg(UNITS, {});
        const byBase = levelTree(UNITS, ['base'], {});
        let sumN = 0, sumD = 0;
        byBase.forEach(n => { const a = agg(n.units, {}); sumN += a.attendN; sumD += a.attendD; });
        S.push(['加权聚合==全量', sumN === full.attendN && sumD === full.attendD]);
        // 2. 新老生拆合
        const news = UNITS.filter(u => u.isNew), olds = UNITS.filter(u => !u.isNew);
        const aN = agg(news, {}), aO = agg(olds, {});
        S.push(['新老生拆合', aN.unitCount + aO.unitCount === full.unitCount && aN.attendN + aO.attendN === full.attendN]);
        // 3. coverage 去重（深沟覆盖 ≤ 深沟次数）
        S.push(['覆盖≤次数', full.deepCovered <= full.deepCount]);
        // 4. better:lower 方向（退费率低位=lead；用 9 个组长的样本保证分位粒度）
        const byGroup = levelTree(UNITS, ['groupLeader'], {});
        const vals = byGroup.map(n => METRICS.refundRate.num(agg(n.units, {})));
        const minV = Math.min(...vals.filter(v => v != null));
        const lv = rankLevel(vals.filter(v => v != null), minV, 'lower');
        S.push(['lower方向', lv.level === 'lead']);
        return S;
    }

    // ---------- 对外 API ----------
    return {
        UNITS, GRADE_LEADERS, GRADE_LEADER_MAP,
        LECTURE_COUNT, LECTURE_DATES, DAY_COUNT, DAY_LABELS,
        METRICS, DIMENSIONS,
        SUMMER_TEACHERS, SUMMER_UNITS, SUMMER_REFERRAL_LEADS, SEASON_DATA,
        SUMMER_DAY_COUNT, SUMMER_DAY_LABELS, SUMMER_PERIOD_RANGE,
        get FUNNEL_STAGES() { return FUNNEL_STAGES; },
        saveFunnel,
        GROUP_SESSIONS, LAGGARD_LEADER, FUNNEL_GAP_LEADER,
        REFUND_EVENTS, REFERRAL_LEADS, REFERRAL_LEADS_BY_UNIT, REFUND_REASONS, PERIOD_RANGE,
        agg, levelTree, rankLevel, positionText,
        lectureTrend, dayTrend, dimValue,
        groupOpenCount,
        loadChains, saveChain, deleteChain,
        sanity,
        pct, fixed1,
    };
})();

// 首讲日期（退费开班期窗口参考）
HXD.FIRST_LESSON_DATE = '2026-09-02';
