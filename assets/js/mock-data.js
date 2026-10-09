/* =========================================================
 * HX_Dashboard mock-data.js — 唯一数据源
 * 恒行管理者后台原型 mock 数据
 * 组织：3基地（保定/沈阳/长春）× 小学一至六年级 × 语数英 × 79辅导
 * ========================================================= */

// ---------- 基础配置 ----------
const APP = {
    role: '管理者',
    period: '2026秋季班（26秋）',
    today: '2026-09-30',
    // 差值预警阈值（可调）：>red 需复盘 / orange~red 关注 / <orange 正常
    diffThreshold: { red: 5, orange: 3 },
};

// ---------- 组织架构 ----------
const ORG = {
    bases: ['保定', '沈阳', '长春'],
    subjects: ['语文', '数学', '英语'],
    grades: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
};

// 学科负责人（每基地每学科1人 → 9人）
const SUBJECT_LEADERS = [
    '王语嫣', '王语彤', '王语晴',           // 保定 语/数/英
    '李数理', '李数涵', '李数远',           // 沈阳 语/数/英
    '赵英文', '赵英华', '赵英才',           // 长春 语/数/英
];

// 组长（槽位 = 基地|学科 → 组长数组；保定语文 6 个组长，其余槽位单人）
const GROUP_SLOTS = {
    '保定|语文': ['孙建军', '李文博', '赵国庆', '钱海燕', '秦雪梅', '何志强'],
    '保定|数学': ['周俊杰'],
    '保定|英语': ['吴欣妍'],
    '沈阳|语文': ['郑天宇'],
    '沈阳|数学': ['冯明辉'],
    '沈阳|英语': ['陈晓芸'],
    '长春|语文': ['褚建国'],
    '长春|数学': ['卫志远'],
    '长春|英语': ['蒋春花'],
};
const GROUP_LEADERS = Object.entries(GROUP_SLOTS).flatMap(([, leaders]) => leaders);  // 14 人扁平

// ---------- 伪随机（保证每次刷新一致） ----------
let _seed = 20260930;
function rnd() {
    _seed = (_seed * 9301 + 49297) % 233280;
    return _seed / 233280;
}
function rndRange(min, max) { return min + rnd() * (max - min); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function fixed1(v) { return Math.round(v * 10) / 10; }

// ---------- 生成辅导池（保定语文 30 人=6组长×5辅导，其余槽位每组 6~7 人） ----------
// 姓氏池 × 名字池
const _surnames = ['张', '刘', '杨', '黄', '徐', '朱', '高', '林', '何', '郭', '马', '罗',
    '梁', '宋', '唐', '许', '韩', '沈', '苏', '卢', '魏', '姜', '崔', '谭'];
const _given = ['雨欣', '浩然', '子轩', '思远', '嘉怡', '志强', '梦琪', '文博', '佳琪', '天宇',
    '紫涵', '俊杰', '欣妍', '明辉', '晓芸', '国庆', '海燕', '建军', '雪梅', '春花'];

const TEACHERS = [];
(function buildTeachers() {
    let idx = 0;
    const usedNames = new Set();
    // 预占各级管理者姓名，避免随机生成的辅导与其重名
    [...GROUP_LEADERS, ...SUBJECT_LEADERS, '高静宜'].forEach(n => usedNames.add(n));
    ORG.bases.forEach((base, bi) => {
        ORG.subjects.forEach((subject, si) => {
            const slot = GROUP_SLOTS[base + '|' + subject];   // 该槽位的组长名单
            const subjectLeader = SUBJECT_LEADERS[bi * 3 + si];
            const count = (base === '保定' && subject === '语文') ? 30 : ((idx % 3 === 0) ? 7 : 6);
            for (let k = 0; k < count; k++, idx++) {
                let name;
                do { name = pick(_surnames) + pick(_given); } while (usedNames.has(name));
                usedNames.add(name);
                // 保定语文前 20 人固定三年级：保证年级组长（高静宜=保定|三年级）名下辅导充足
                const grade = (base === '保定' && subject === '语文' && idx < 20) ? '三年级' : pick(ORG.grades);
                TEACHERS.push({
                    id: 'T' + String(1001 + idx),
                    name: name + '（辅导）',
                    shortName: name,
                    base: base,
                    subject: subject,
                    grade: grade,
                    groupLeader: slot[k % slot.length],   // 槽位内轮询分配组长
                    subjectLeader: subjectLeader,
                    studentCount: Math.round(rndRange(80, 220)),       // 班内学员数
                    newStudentCount: Math.round(rndRange(15, 60)),     // 新生
                });
            }
        });
    });
})();

// ---------- 差值预警的3个特殊辅导（前3人改为高危） ----------
TEACHERS[0].isDiffAlert = true;   // 差值 >5pp
TEACHERS[13].isDiffAlert = true;
TEACHERS[47].isDiffAlert = true;

// ---------- 1. 核心课数据 ----------
// 目标：到课92% 深参78% 提交85% 正确率80% 笔记60%
const CORE_TARGET = { attend: 92, deep: 78, submit: 85, correct: 80, note: 60 };

TEACHERS.forEach(t => {
    const attend = fixed1(rndRange(84, 98));            // 到课率
    const deep = fixed1(attend - rndRange(12, 30));     // 深参率（低于到课15~30pp）
    const submit = fixed1(rndRange(70, 96));            // 作业提交率
    t.core = {
        attend: attend,
        deep: deep,
        submit: submit,
        diff: fixed1(submit - deep),                    // 差值 = 提交 − 深参
        correct: fixed1(rndRange(68, 92)),              // 作业正确率
        note: fixed1(rndRange(45, 78)),                  // 笔记提交率
    };
    if (t.isDiffAlert) {                                 // 差值高危：提交很高但深参很低
        t.core.deep = fixed1(t.core.submit - rndRange(6, 9));
        t.core.diff = fixed1(t.core.submit - t.core.deep);
    }
});

// 汇总（管理者视角全局）
const CORE_SUMMARY = (() => {
    const n = TEACHERS.length;
    const avg = k => fixed1(TEACHERS.reduce((s, t) => s + t.core[k], 0) / n);
    return {
        attend: avg('attend'), deep: avg('deep'), submit: avg('submit'),
        diff: avg('diff'), correct: avg('correct'), note: avg('note'),
    };
})();

// 每讲数据（16讲，用于抽屉明细；对差值预警者制造低讲）
function buildLessonSeries(teacher) {
    const lessons = [];
    for (let i = 1; i <= 16; i++) {
        const lessonDate = new Date(2026, 8, 2 + (i - 1) * 3);
        const swing = rndRange(-6, 6);
        let attend = fixed1(Math.min(99, teacher.core.attend + swing));
        let deep = fixed1(Math.max(30, teacher.core.deep + rndRange(-8, 5)));
        let submit = fixed1(Math.min(99, teacher.core.submit + rndRange(-5, 5)));
        lessons.push({
            lesson: i,
            date: `${String(lessonDate.getMonth() + 1).padStart(2, '0')}-${String(lessonDate.getDate()).padStart(2, '0')}`,
            attend, deep, submit,
            diff: fixed1(submit - deep),
            low: (deep < 60 || (submit - deep) > APP.diffThreshold.red),  // 低讲标记
        });
    }
    // 差值预警者：插入2个明显低讲
    if (teacher.isDiffAlert) {
        [6, 11].forEach(li => {
            lessons[li - 1].deep = fixed1(lessons[li - 1].deep - 18);
            lessons[li - 1].low = true;
        });
    }
    return lessons;
}
TEACHERS.forEach(t => { t.lessons = buildLessonSeries(t); });

// ---------- 2. 沟通数据 ----------
// 企微回复榜（组维度9组 + 辅导维度）、深沟榜、小班会榜、服务链路
const GROUPS = GROUP_LEADERS.map((leader, i) => {
    const slotKey = Object.keys(GROUP_SLOTS).find(k => GROUP_SLOTS[k].includes(leader));
    const [gBase, gSubject] = slotKey.split('|');
    return {
        id: 'G' + (201 + i),
        name: leader + '组',
        groupLeader: leader,
        base: gBase,
        subject: gSubject,
        members: TEACHERS.filter(t => t.groupLeader === leader).length,
    };
});

// 企微回复（组维度）
GROUPS.forEach((g, i) => {
    g.reply = {
        replyCount: Math.round(rndRange(320, 780)),          // 回复量
        replyRate: fixed1(rndRange(72, 97)),                 // 回复率%
        yesterdayDelta: fixed1(rndRange(-4, 5)),             // 日环比pp
        rankChange: pick([1, 0, 0, -1, 2, 0, -2, 1]),        // 排名变动
    };
});
// 深沟（组维度）
GROUPS.forEach(g => {
    g.deep = {
        deepCount: Math.round(rndRange(120, 400)),           // 深沟次数
        deepCoverage: fixed1(rndRange(45, 88)),              // 深沟覆盖率%
        avgPerMaster: fixed1(rndRange(3.2, 8.5)),            // 人均深沟次数
    };
});
// 小班会（组维度）
GROUPS.forEach(g => {
    g.meeting = {
        openCount: Math.round(rndRange(14, 48)),             // 开课次数
        attendRate: fixed1(rndRange(62, 92)),                 // 参课率%（≥20min）
        coverage: fixed1(rndRange(55, 90)),                   // 覆盖率%
    };
});

// 辅导维度的企微回复/深沟（挂在 TEACHERS 上，榜单复用）
TEACHERS.forEach(t => {
    t.comm = {
        wechatReplyCount: Math.round(rndRange(35, 130)),
        wechatReplyRate: fixed1(rndRange(65, 98)),
        deepCount: Math.round(rndRange(15, 70)),
        deepCoverage: fixed1(rndRange(40, 90)),
    };
});

// 服务链路（可配置阶段，漏斗）
const COMM_FUNNEL = {
    editable: true,   // 管理员每期统一配置
    stages: [
        { name: '开班期沟通', standard: 100, actual: 96.2, desc: '开班首周 1v1 覆盖全部学员' },
        { name: '一轮覆盖', standard: 100, actual: 91.5, desc: '首次电话/深沟覆盖' },
        { name: '二轮沟通', standard: 95, actual: 87.4, desc: '未覆盖与低意向二触' },
        { name: '摸底', standard: 90, actual: 75.6, desc: '全量电话摸底 + 意向分级' },
    ],
};

// 沟通汇总
const COMM_SUMMARY = (() => {
    const n = GROUPS.length;
    return {
        wechatReplyRate: fixed1(GROUPS.reduce((s, g) => s + g.reply.replyRate, 0) / n),
        deepCoverage: fixed1(GROUPS.reduce((s, g) => s + g.deep.deepCoverage, 0) / n),
        meetingCoverage: fixed1(GROUPS.reduce((s, g) => s + g.meeting.coverage, 0) / n),
        meetingOpenCount: GROUPS.reduce((s, g) => s + g.meeting.openCount, 0),
    };
})();

// ---------- 3. 退费数据 ----------
// 三阶段固定窗口：开班期=首讲前后7天 / 日常行课 / 行课后服务
const REFUND_TARGET = { total: 5, fresh: 8, old: 4, retain: 40 };

const REFUND_REASONS = ['效果不及预期', '时间冲突', '价格因素', '学生自觉性差', '家长更换机构', '其他'];

// 2个退费高危 + 1个挽单成功
TEACHERS[8].isRefundAlert = true;
TEACHERS[31].isRefundAlert = true;
TEACHERS[22].isRetainStar = true;

TEACHERS.forEach(t => {
    let totalRate = rndRange(0.5, 4.5);
    if (t.isRefundAlert) totalRate = rndRange(5.5, 7.8);       // 超目标5%
    if (t.isRetainStar) totalRate = rndRange(0.3, 1.2);        // 挽单明星，退费极低
    t.refund = {
        openPeriod: {   // 开班期（新老生）
            totalRate: fixed1(Math.max(0.1, totalRate * rndRange(0.5, 0.9))),
            freshRate: fixed1(Math.max(0.2, totalRate * rndRange(1.0, 1.6))),
            oldRate: fixed1(Math.max(0.1, totalRate * rndRange(0.3, 0.8))),
        },
        ongoing: {      // 日常行课
            totalRate: fixed1(Math.max(0.1, totalRate * rndRange(0.7, 1.2))),
            freshRate: fixed1(Math.max(0.2, totalRate * rndRange(0.8, 1.4))),
            oldRate: fixed1(Math.max(0.1, totalRate * rndRange(0.4, 0.9))),
        },
        afterCourse: {  // 行课后服务
            totalRate: fixed1(Math.max(0.1, totalRate * rndRange(0.4, 1.0))),
            freshRate: fixed1(Math.max(0.1, totalRate * rndRange(0.5, 1.2))),
            oldRate: fixed1(Math.max(0.1, totalRate * rndRange(0.3, 0.7))),
        },
        // 汇总口径（三阶段合计）
        totalRate: fixed1(totalRate),
        freshRate: 0, oldRate: 0,
        refundCount: 0,
        retainRate: fixed1(t.isRetainStar ? rndRange(88, 95) : rndRange(18, 65)),  // 挽单率
        reasons: [pick(REFUND_REASONS), pick(REFUND_REASONS), pick(REFUND_REASONS)],
        students: [],     // 退费学员明细（抽屉）
    };
    t.refund.freshRate = fixed1((t.refund.openPeriod.freshRate + t.refund.ongoing.freshRate + t.refund.afterCourse.freshRate) / 3);
    t.refund.oldRate = fixed1((t.refund.openPeriod.oldRate + t.refund.ongoing.oldRate + t.refund.afterCourse.oldRate) / 3);
    t.refund.refundCount = Math.max(1, Math.round(t.studentCount * totalRate / 100));
    // 退费学员明细
    for (let i = 0; i < Math.min(t.refund.refundCount, 5); i++) {
        t.refund.students.push({
            student: pick(_surnames) + pick(['同学', '小', '同学']),
            isNew: rnd() > 0.5,
            stage: pick(['开班期', '日常行课', '行课后']),
            reason: pick(REFUND_REASONS),
            amount: Math.round(rndRange(800, 4200)),
            date: `09-${String(Math.floor(rndRange(1, 28))).padStart(2, '0')}`,
            retained: t.isRetainStar ? rnd() > 0.2 : rnd() > 0.7,
        });
    }
});

// 挽单录音 AI 分析（抽屉用，抽屉打开时按辅导生成）
function buildAiRetainAnalysis(teacher) {
    const cases = [];
    const n = teacher.isRetainStar ? 3 : (teacher.isRefundAlert ? 4 : 2);
    for (let i = 0; i < n; i++) {
        cases.push({
            student: pick(_surnames) + pick(['同学', '小', '同学']),
            aiScore: fixed1(rndRange(55, 94)),               // AI 分析评分
            risk: pick(['高', '中', '中', '低']),
            summary: pick([
                '家长反馈孩子作业压力大、时间冲突，辅导未在首触中给出排课方案，建议复盘话术。',
                '家长认可服务但认为价格偏高，辅导提供了续报优惠信息，挽单动作及时，建议分享话术。',
                '学生连续2讲未到课，辅导已跟进但未升级组长协谈，错过最佳挽单窗口。',
                '家长提出效果质疑，辅导用学情数据回应得当，家长情绪缓和，转意向观察。',
                '沟通时长不足3分钟，未覆盖真实退费原因，AI判定为低效挽单，建议组长介入。',
            ]),
            duration: `${Math.floor(rndRange(2, 18))}分${String(Math.floor(rndRange(0, 59))).padStart(2, '0')}秒`,
        });
    }
    return cases;
}

// 退费汇总（三阶段独立汇总）
const REFUND_SUMMARY = (() => {
    const n = TEACHERS.length;
    const avg = f => fixed1(TEACHERS.reduce((s, t) => s + f(t), 0) / n);
    return {
        openPeriod: { totalRate: avg(t => t.refund.openPeriod.totalRate), freshRate: avg(t => t.refund.openPeriod.freshRate), oldRate: avg(t => t.refund.openPeriod.oldRate) },
        ongoing: { totalRate: avg(t => t.refund.ongoing.totalRate), freshRate: avg(t => t.refund.ongoing.freshRate), oldRate: avg(t => t.refund.ongoing.oldRate) },
        afterCourse: { totalRate: avg(t => t.refund.afterCourse.totalRate), freshRate: avg(t => t.refund.afterCourse.freshRate), oldRate: avg(t => t.refund.afterCourse.oldRate) },
        retainRate: avg(t => t.refund.retainRate),
        alertCount: TEACHERS.filter(t => t.refund.totalRate > REFUND_TARGET.total).length,
    };
})();

// ---------- 5. 策略目标管理 ----------
// 五类目标类型
const GOAL_TYPES = [
    { key: 'meeting_cover', name: '小班会覆盖', unit: '%' },
    { key: 'one_on_one', name: '1对1沟通覆盖', unit: '%' },
    { key: 'call_total', name: '电话沟通总量', unit: '通' },
    { key: 'survey_cover', name: '摸底覆盖量', unit: '%' },
    { key: 'intent_ratio', name: '意向用户占比', unit: '%' },
];

// 目标三状态：已达成 / 落后于预期 / 已逾期
const GOALS = [
    {
        id: 'GL-001', type: 'meeting_cover', typeName: '小班会覆盖', owner: '孙建军（保定·语文）',
        ownerLevel: '组长', range: '09-15 ~ 10-15', standard: '开班期小班会覆盖全部在班学员',
        target: 80, current: 86.5, expectedToday: 74,
        status: 'achieved', actions: [
            { date: '09-28', action: '小班会补开 2 场', result: '新增覆盖 18 人' },
            { date: '09-29', action: '未到课学员逐一提醒', result: '覆盖 +9 人' },
        ],
    },
    {
        id: 'GL-002', type: 'one_on_one', typeName: '1对1沟通覆盖', owner: '郑天宇（沈阳·语文）',
        ownerLevel: '组长', range: '09-10 ~ 10-10', standard: '一轮覆盖期内 1v1 达 100%',
        target: 100, current: 78.2, expectedToday: 85,
        status: 'behind', actions: [
            { date: '09-28', action: '集中电访未覆盖学员', result: '覆盖 +22 人' },
            { date: '09-29', action: '企微私信未回复名单二触', result: '回复率 41%，覆盖 +6 人' },
        ],
    },
    {
        id: 'GL-003', type: 'call_total', typeName: '电话沟通总量', owner: '李数理（沈阳·学科负责人）',
        ownerLevel: '学科负责人', range: '09-01 ~ 09-25', standard: '每辅导日均外呼 ≥15 通',
        target: 3500, current: 3205, expectedToday: 3500,
        status: 'overdue', actions: [
            { date: '09-24', action: '冲刺周：全员加呼', result: '日均 +260 通' },
            { date: '09-25', action: '周期截止复盘', result: '缺口 295 通，3 组未达标' },
        ],
    },
    {
        id: 'GL-004', type: 'survey_cover', typeName: '摸底覆盖量', owner: '卫志远（长春·英语）',
        ownerLevel: '组长', range: '09-20 ~ 10-20', standard: '摸底电话覆盖全部在班学员并完成意向分级',
        target: 95, current: 74.8, expectedToday: 71,
        status: 'ontrack', actions: [
            { date: '09-28', action: '摸底专场：晚间集中外呼', result: '覆盖 +31 人' },
            { date: '09-29', action: '低意向名单转深沟', result: '深沟 12 单' },
        ],
    },
    {
        id: 'GL-005', type: 'intent_ratio', typeName: '意向用户占比', owner: '褚建国（长春·语文）',
        ownerLevel: '组长', range: '09-20 ~ 10-20', standard: '摸底后高+中意向占比目标',
        target: 55, current: 48.6, expectedToday: 47,
        status: 'ontrack', actions: [
            { date: '09-29', action: '无意向学员二次价值传递', result: '高意向 +4 人' },
        ],
    },
];

// 摸底意向分布（堆叠：低/中/高/无 + 未沟通）
const INTENT_DIST = [
    { name: '保定', high: 18.2, mid: 30.5, low: 14.8, none: 12.1, uncontacted: 24.4 },
    { name: '沈阳', high: 15.6, mid: 33.2, low: 16.4, none: 10.8, uncontacted: 24.0 },
    { name: '长春', high: 20.4, mid: 28.7, low: 13.2, none: 11.5, uncontacted: 26.2 },
];

// 每日动作执行流水（进度追踪页）
const ACTION_LOGS = [
    { time: '09-30 09:20', owner: '孙建军', goal: '小班会覆盖 80%', action: '排期本周小班会 6 场', note: '按计划执行' },
    { time: '09-30 10:05', owner: '郑天宇', goal: '1对1覆盖 100%', action: '下发未覆盖名单 58 人', note: '落后预期，加急' },
    { time: '09-30 11:30', owner: '卫志远', goal: '摸底覆盖 95%', action: '晚间外呼专场动员', note: '进度正常' },
    { time: '09-30 14:10', owner: '李数理', goal: '电话总量 3500 通', action: '周期复盘会（已逾期）', note: '缺口 295 通' },
    { time: '09-30 16:40', owner: '褚建国', goal: '意向占比 55%', action: '无意向名单二触话术下发', note: '进行中' },
];

// ---------- 总览预警流 ----------
function buildAlerts() {
    const alerts = [];
    // 核心课差值预警
    TEACHERS.filter(t => t.isDiffAlert).forEach(t => {
        alerts.push({
            level: 'high', module: 'core-course', moduleColor: 'indigo',
            title: `深参与作业提交差值 ${t.core.diff}pp`,
            detail: `${t.shortName}（${t.base}·${t.subject}）提交率 ${t.core.submit}% 但深参率仅 ${t.core.deep}%，建议重点复盘听课质量`,
        });
    });
    // 退费超目标
    TEACHERS.filter(t => t.isRefundAlert).forEach(t => {
        alerts.push({
            level: 'high', module: 'refund', moduleColor: 'rose',
            title: `班内退费率 ${t.refund.totalRate}% 超学科目标 ${REFUND_TARGET.total}%`,
            detail: `${t.shortName}（${t.base}·${t.subject}）退费 ${t.refund.refundCount} 人，新退费率 ${t.refund.freshRate}%，建议今日录音复盘`,
        });
    });
    // 目标落后
    GOALS.filter(g => g.status === 'behind').forEach(g => {
        alerts.push({
            level: 'mid', module: 'management', moduleColor: 'amber',
            title: `「${g.typeName}」目标落后预期 ${fixed1(g.expectedToday - g.current)}pp`,
            detail: `${g.owner} 当前进度 ${g.current}%（应达 ${g.expectedToday}%），目标值 ${g.target}${g.type === 'call_total' ? '通' : '%'}，周期 ${g.range}`,
        });
    });
    // 未沟通积压
    alerts.push({
        level: 'mid', module: 'management', moduleColor: 'amber',
        title: `摸底未沟通学员约 24.9%`,
        detail: `全国三基地合计，其中长春 26.2% 最高，建议本周内清零`,
    });
    // 排序：high 优先
    return alerts.sort((a, b) => (a.level === 'high' ? -1 : 1) - (b.level === 'high' ? -1 : 1));
}

// ---------- 排名辅助 ----------
// 按指标绝对值排名（desc），返回带 rank 的数组
function rankBy(list, getVal, desc = true) {
    const arr = [...list];
    arr.sort((a, b) => desc ? getVal(b) - getVal(a) : getVal(a) - getVal(b));
    arr.forEach((item, i) => { item.rank = i + 1; });
    return arr;
}
