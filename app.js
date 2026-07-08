/**
 * Activity Tracker & Study Manager v3.0
 */

// ==========================================
// CONSTANTS & STATE
// ==========================================
const STORAGE_KEYS = {
    SUBJECTS: 'cseb_study_subjects',
    ATTENDANCE: 'cseb_study_attendance',
    SESSIONS: 'cseb_session_history',
    GOALS: 'cseb_study_goals',
    ACCA_TOPICS: 'cseb_acca_topics',
    MOCKS: 'cseb_mock_tests',
    PRACTICE: 'cseb_question_practice',
    CSEB_SYLLABUS: 'cseb_syllabus_tracker',
    NOTIFICATIONS: 'cseb_notifications',
    SCHEDULE: 'cseb_study_schedule',
    SYSTEM_STATE: 'cseb_system_state',
    ACHIEVEMENTS: 'cseb_achievements',
    WORKOUT: 'cseb_workout_questions',
    // Device-local only — never cloud-synced.
    // Tracks the last version the user installed so sign-out/re-login
    // never re-triggers the update popup for an already-seen version.
    LAST_SEEN_VERSION: 'cseb_last_seen_version'
};

const DEFAULT_GOALS = { daily: 8, weekly: 40, monthly: 160 };
const CUTOFF_DATE = new Date('2026-02-15T00:00:00');

const generateId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

// ── Performance helpers ────────────────────────────────────────────────────
/** Returns a debounced version of fn that fires after `wait` ms of silence */
const debounce = (fn, wait = 150) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
};

/** Schedules fn in the next animation frame (keeps heavy renders off the main thread) */
const nextFrame = (fn) => requestAnimationFrame(fn);

// Debounced wrappers for the three heaviest render functions
// (safe to call many times in quick succession – only the last call fires)
const debouncedRenderOverview  = debounce(() => renderOverview(),  80);
const debouncedRenderAnalytics = debounce(() => renderAnalytics(), 200);
const debouncedRenderAttendance= debounce(() => renderAttendance(),120);


const DEFAULT_SUBJECTS = [
    // CSEB Subjects
    { id: generateId(), name: 'Banking (CSEB)', course: 'CSEB', color: '#2997FF', priority: 'High', targetHours: 5, totalHours: 0 },
    { id: generateId(), name: 'Cooperation (CSEB)', course: 'CSEB', color: '#30D158', priority: 'High', targetHours: 5, totalHours: 0 },
    { id: generateId(), name: 'Act & Rules (CSEB)', course: 'CSEB', color: '#BF5AF2', priority: 'High', targetHours: 5, totalHours: 0 },
    { id: generateId(), name: 'General English (CSEB)', course: 'CSEB', color: '#FFD60A', priority: 'Medium', targetHours: 3, totalHours: 0 },
    { id: generateId(), name: 'General Knowledge (CSEB)', course: 'CSEB', color: '#FF453A', priority: 'Low', targetHours: 2, totalHours: 0 },
    { id: generateId(), name: 'Reasoning (CSEB)', course: 'CSEB', color: '#FF9F0A', priority: 'Medium', targetHours: 3, totalHours: 0 },
    { id: generateId(), name: 'Accounting (CSEB)', course: 'CSEB', color: '#32ADE6', priority: 'High', targetHours: 5, totalHours: 0 },
    
    // ACCA Subjects
    { id: generateId(), name: 'Financial Reporting (FR)', course: 'ACCA', color: '#0A84FF', priority: 'High', targetHours: 38, totalHours: 0 }
];

const EXAMS = [
    { category: 'ACCA · UPCOMING', date: '2026-09-10T00:00:00', title: 'Financial Reporting (FR)', subtext: 'Sep 2026 Session' },
    { category: 'CAT 11/2026', date: null, title: 'Junior Clerk / Cashier', subtext: 'Special Grade · Class-I Banks', postponed: true },
    { category: 'CAT 10/2026', date: null, title: 'Junior Clerk / Cashier', subtext: 'Super Grade Banks', postponed: true },
    { category: 'CAT 09/2026', date: null, title: 'Assistant Secretary', subtext: '', postponed: true }
];

const AppState = {
    subjects: [],
    attendance: {},
    sessions: [],
    goals: DEFAULT_GOALS,
    accaTopics: {},
    mockTests: [],
    questionPractice: { attempted: 0, correct: 0 },
    csebSyllabus: {},
    notifications: [],
    schedule: [],
    achievements: [],
    workoutQuestions: [],
    workoutStats: { totalDone: 0, totalCorrect: 0 },
    currentVersion: 'v1.0.62',
    dataVersion: 2,
    availableUpdate: null,
    analyticsCache: null
};

// Global Memory Cache for expensive parsed data
const appCache = {
    analytics: null,
    sessionsHash: null,
    analyticsVersion: 1
};

// ==========================================
// UTILITIES
// ==========================================
// Safely escape user-supplied strings before inserting into innerHTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const Storage = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null || raw === undefined) return fallback;
            return JSON.parse(raw) ?? fallback;
        } catch (e) { return fallback; }
    },
    set(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
    }
};

const TimeUtils = {
    formatDisplay(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },
    formatHours(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    },
    getDateKey(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    getWeekKey(d = new Date()) {
        const d1 = new Date(d);
        d1.setHours(0, 0, 0, 0);
        // Shift date back to Sunday (0) to group from Sunday to Saturday
        d1.setDate(d1.getDate() - d1.getDay());
        return `${d1.getFullYear()}-W-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
    },
    getMonthKey(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
};

function updateSessionBadges(id) {
    const b1 = document.getElementById('currentSessionBadge');
    const b2 = document.getElementById('timerSessionBadge');
    if (id) {
        if(b1) { b1.textContent = `Active: ${id}`; b1.style.display = 'block'; }
        if(b2) { b2.textContent = `Active: ${id}`; b2.style.display = 'block'; }
    } else {
        if(b1) b1.style.display = 'none';
        if(b2) b2.style.display = 'none';
    }
}

// ==========================================
// DATA MANAGEMENT
// ==========================================
function loadData() {
    AppState.subjects = Storage.get(STORAGE_KEYS.SUBJECTS, []);
    
    // Pre-populate with default courses if empty
    if (AppState.subjects.length === 0) {
        AppState.subjects = [...DEFAULT_SUBJECTS];
        saveData('subjects');
    } else {
        // Migration: Fix old default names to match syllabus keys
        let changed = false;
        AppState.subjects.forEach(s => {
            if (s.name === 'Co-operation (CSEB)') { s.name = 'Cooperation (CSEB)'; changed = true; }
            if (s.name === 'KCS Act and Rules (CSEB)') { s.name = 'Act & Rules (CSEB)'; changed = true; }
            if (s.name === 'English (CSEB)') { s.name = 'General English (CSEB)'; changed = true; }
            if (s.name === 'GK (CSEB)') { s.name = 'General Knowledge (CSEB)'; changed = true; }
            if (s.name === 'Accountancy (CSEB)') { s.name = 'Accounting (CSEB)'; changed = true; }
        });
        if (changed) saveData('subjects');
    }

    AppState.attendance = Storage.get(STORAGE_KEYS.ATTENDANCE, {});
    AppState.sessions = Storage.get(STORAGE_KEYS.SESSIONS, []);
    AppState.goals = Storage.get(STORAGE_KEYS.GOALS, DEFAULT_GOALS);
    
    // New tracking keys
    AppState.mockTests = Storage.get(STORAGE_KEYS.MOCKS, []);
    AppState.questionPractice = Storage.get(STORAGE_KEYS.PRACTICE, { attempted: 0, correct: 0 });
    AppState.csebSyllabus = Storage.get(STORAGE_KEYS.CSEB_SYLLABUS, {});
    AppState.accaTopics = Storage.get(STORAGE_KEYS.ACCA_TOPICS, {});
    
    // Force reset if accaTopics is an old legacy array to trigger the fallback builder
    if (Array.isArray(AppState.accaTopics)) {
        AppState.accaTopics = {};
    }

    AppState.notifications = Storage.get(STORAGE_KEYS.NOTIFICATIONS, []);
    AppState.schedule = Storage.get(STORAGE_KEYS.SCHEDULE, []);
    AppState.achievements = Storage.get(STORAGE_KEYS.ACHIEVEMENTS, []);
    AppState.workoutQuestions = Storage.get(STORAGE_KEYS.WORKOUT, []);
    
    // Sort workout questions permanently by topic
    AppState.workoutQuestions.sort((a, b) => {
        const topicA = (a.course || '') + (a.subject || '') + (a.subtopic || '');
        const topicB = (b.course || '') + (b.subject || '') + (b.subtopic || '');
        if (topicA === topicB) {
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        return topicA.localeCompare(topicB);
    });

    AppState.workoutStats = Storage.get('cseb_workout_stats', { totalDone: 0, totalCorrect: 0 });
    
    const sysState = Storage.get(STORAGE_KEYS.SYSTEM_STATE, { currentVersion: 'v1.0.63', availableUpdate: null, dataVersion: 1 });
    AppState.currentVersion = sysState.currentVersion || 'v1.0.63';
    AppState.availableUpdate = sysState.availableUpdate;
    AppState.dataVersion = sysState.dataVersion || 1;
    
    if (Object.keys(AppState.csebSyllabus).length === 0) {
        AppState.csebSyllabus = {
            "Act & Rules": [
                { name: "KCS Act 1969: Registration of Societies & Membership", completed: false },
                { name: "KCS Act 1969: Management, Share Capital & Funds", completed: false },
                { name: "KCS Act 1969: Audit - Section 28", completed: false },
                { name: "KCS Act 1969: Inspection (S.68) & Surcharge (S.65)", completed: false },
                { name: "KCS Act 1969: Disputes (S.70) & Arbitration (S.69)", completed: false },
                { name: "KCS Act 1969: Liquidation & Winding Up", completed: false },
                { name: "Kerala Co-operative Societies Rules 1969 (As Amended) — Full", completed: false }
            ],
            "General English": [
                { name: "Types of Sentences, Interchange, Parts of Speech", completed: false },
                { name: "Subject-Verb Agreement, Articles", completed: false },
                { name: "Primary & Modal Auxiliary Verbs, Question Tags", completed: false },
                { name: "Infinitive & Gerunds, Tenses, Conditional Sentences", completed: false },
                { name: "Prepositions & Correlatives", completed: false },
                { name: "Direct/Indirect Speech, Active/Passive Voice, Correction of Sentences", completed: false },
                { name: "Singular/Plural, Gender, Collective Nouns, Compound Words", completed: false },
                { name: "Synonyms, Antonyms, Phrasal Verbs, Words Often Confused", completed: false },
                { name: "Foreign Words & Phrases, One Word Substitutes", completed: false },
                { name: "Spelling Test, Idioms & Meanings, Common Abbreviations", completed: false }
            ],
            "Reasoning": [
                { name: "Numbers, Basic Operations, Fractions, Decimals, Percentage", completed: false },
                { name: "Profit & Loss, Simple & Compound Interest", completed: false },
                { name: "Ratio & Proportion, Average", completed: false },
                { name: "Time & Distance, Time & Work", completed: false },
                { name: "Series, Math Signs, Position Determination Test", completed: false },
                { name: "Analogy (Word, Alphabet, Number), Odd Man Out", completed: false },
                { name: "Coding & Decoding, Number Review System, Clerical Ability", completed: false },
                { name: "Family Relations, Sense of Direction", completed: false },
                { name: "Time & Angles, Clock Reflection, Date & Calendar", completed: false }
            ],
            "General Knowledge": [
                { name: "United Nations: Structure, Organs, Specialised Agencies", completed: false },
                { name: "History: Freedom Struggle, Travancore, Social Reform Movements", completed: false },
                { name: "Political History (India & Kerala), Indian Constitution", completed: false },
                { name: "Five-Year Plans, Economic Reforms, Reorganisation of States", completed: false },
                { name: "Governance & Systems (India/Kerala), Indian States & Characteristics", completed: false },
                { name: "Oceans, Continents, Global Warming — Kerala Geography, Districts, Rivers", completed: false },
                { name: "Agricultural Crops, Minerals, Green Revolution", completed: false },
                { name: "Art, Sports, Literature & Culture (World, India, Kerala)", completed: false },
                { name: "Current Affairs", completed: false }
            ],
            "Banking": [
                { name: "Banking System: Scheduled/Non-Scheduled, RRBs, Co-op Banks, Foreign, Small Finance, Payment Banks", completed: false },
                { name: "CRR, SLR, Repo, Reverse Repo, Bank Rates — NABARD & NBFC", completed: false },
                { name: "Banker & Customer Relationship — Types of Customers", completed: false },
                { name: "Special Customers: Minors, Pardanashan Ladies, Blind, Lunatic, Insolvent", completed: false },
                { name: "KYC — Know Your Customer Guidelines", completed: false },
                { name: "Anti Money Laundering (AML) Guidelines of RBI", completed: false },
                { name: "Regulatory & Supervisory Functions of RBI", completed: false },
                { name: "NI Act 1881: Promissory Notes, Bills of Exchange, Cheques", completed: false },
                { name: "Types of Crossings: General, Special, Non-Negotiable", completed: false },
                { name: "Endorsements: Blank, Full, Conditional, Restrictive, Sans Recourse, Facultative", completed: false },
                { name: "Payment Systems: RTGS, NEFT, UPI, ATMs, POS, QR Code, CBS, Debit/Credit Cards", completed: false },
                { name: "Grievance: Integrated Ombudsman Scheme 2021 & COPRA 2019", completed: false },
                { name: "Deposits: Savings, BSBDA, PMJDY, Small Accounts, FD, RD, Current A/c", completed: false },
                { name: "Demand Drafts, Safe Deposit Lockers, Safe Custody of Articles", completed: false },
                { name: "Nomination, Garnishee, Lien, Set Off, Power of Attorney, Pledge, Mortgage", completed: false },
                { name: "Priority Sector (Agri, KCC, MSME) — Loan Types, SMA & NPA Norms", completed: false }
            ],
            "Accounting": [
                { name: "Definition, Objects, Branches, Advantages & Limitations of Financial Accounting", completed: false },
                { name: "Accounting Principles, Concepts & Conventions", completed: false },
                { name: "Journal, Ledger, Subsidiary Books, Trial Balance", completed: false },
                { name: "Errors & Rectification, Final Accounts & Adjustments", completed: false },
                { name: "Depreciation Methods, Bills of Exchange, Consignment", completed: false },
                { name: "Non-Trading Concern Accounts + Co-op Accounting (Day Book, Ledger, R&D, BRS)", completed: false },
                { name: "Cost Types: Marginal, Standard, Opportunity, Sunk, Differential Cost", completed: false },
                { name: "Material Control: Bin Card, Stores Ledger, EOQ, Methods of Valuing Issues", completed: false },
                { name: "Labour Cost & Systems of Wage Payment", completed: false },
                { name: "Financial Planning: SWOT, Budgeting, Capital Budgeting, Cost of Capital", completed: false },
                { name: "Analysis: T&P&L, Balance Sheet, Ratio Analysis, Working Capital", completed: false },
                { name: "CVP: Break-Even, Margin of Safety, Comparative, Trend, Common Size Analysis", completed: false },
                { name: "Cash & Fund Flow Analysis", completed: false },
                { name: "Fraud: Causes, Fraud Triangle, Prevention — Statutory Audit", completed: false }
            ],
            "Cooperation": [
                { name: "ICA Principles, Values, Ethics, Co-op Commonwealth, Distinctive Features", completed: false },
                { name: "Co-op vs Joint Stock — Balancing Capitalism, Socialism, Communism", completed: false },
                { name: "Foreign Co-ops: England (Robert Owen), Germany (Raiffeisen/Schulze), Denmark Dairy", completed: false },
                { name: "Committees: AIRCS, VL Metha, AIRCRC, CRAFICARD, ACRC", completed: false },
                { name: "State Aid: NCDC, NDDB, NHB, NABARD", completed: false },
                { name: "Education & Training: NCUI, SCU, NCCT, VAMNICOM, ICM, CAPE, Co-op Week", completed: false },
                { name: "PACS, KSCB, KCC, Principal State Partnership Fund, NAFSCOB, COBI", completed: false },
                { name: "PCARDB, KSCARDB, Debenture Redemption Fund, NFARDB (Long Term Loans)", completed: false },
                { name: "Urban Co-op Banks, Employee Credit Societies, Housing Co-ops, Housefed, NFUCB", completed: false },
                { name: "Marketing & Processing: Market Fed, Kerafed, Rubco, RAIDCO, CAMPCO", completed: false },
                { name: "Consumer Co-ops: Consumerfed, Neethi Stores, Student Stores, NCCF", completed: false },
                { name: "Dairy Co-ops: APCOS, Primary Milk Societies, KCMMF", completed: false },
                { name: "Industrial Co-ops: Handloom, Coir, Beedi, Handicrafts — Hantex, Coirfed, Dinesh Beedi", completed: false },
                { name: "SC/ST Fed, Matsyafed, Vanithafed, Hospitalfed, Tourfed, Labourfed, ULCCS", completed: false },
                { name: "Schemes: Risk Fund, Deposit Guarantee, Pension, Ombudsman, Member Relief, Welfare Board", completed: false },
                { name: "Co-op Management: HRM, TNA, Budgeting, Asset/Liability Mgt, Leadership, Decision Making", completed: false },
                { name: "Co-operatives Departmental Set Up in Kerala", completed: false }
            ]
        };
        saveData('csebSyllabus');
    }

    // ACCA FR Topics — 23 authorised topics (18 Standards + 5 Core Topics)
    if (Object.keys(AppState.accaTopics).length === 0) {
        AppState.accaTopics = buildDefaultAccaTopics();
        saveData('accaTopics');
    } else {
        // Migration: rebuild to ONLY the 17 authorised topics, preserving completion state
        const defaults = buildDefaultAccaTopics();
        // Collect existing completion states by topic name (any category)
        const existingCompletion = {};
        Object.values(AppState.accaTopics).flat().forEach(t => {
            existingCompletion[t.name] = t.completed || false;
        });
        // Rebuild from scratch — carry over completion, strip everything else
        const rebuilt = {};
        Object.entries(defaults).forEach(([cat, topics]) => {
            rebuilt[cat] = topics.map(t => ({
                ...t,
                completed: existingCompletion[t.name] ?? t.completed
            }));
        });
        AppState.accaTopics = rebuilt;
        saveData('accaTopics');
    }
}

function buildDefaultAccaTopics() {
    // Complete ACCA Financial Reporting topic list (23 topics)
    return {
        "Standards": [
            { name: "IFRS 13 (Fair Value)",           completed: false, difficulty: "Hard"   },
            { name: "IFRS 5 (Non-current Assets)",    completed: false, difficulty: "Medium" },
            { name: "IFRS 18 (Presentation)",         completed: false, difficulty: "Medium" },
            { name: "IAS 36 (Impairment)",            completed: false, difficulty: "Hard"   },
            { name: "IAS 37 (Provisions)",            completed: false, difficulty: "Medium" },
            { name: "IFRS 16 (Leases)",               completed: false, difficulty: "Hard"   },
            { name: "IFRS 9 (Financial Instruments)", completed: false, difficulty: "Hard"   },
            { name: "IFRS 9 (Hedging)",               completed: false, difficulty: "Hard"   },
            { name: "IAS 8 (Accounting Policies)",    completed: false, difficulty: "Medium" },
            { name: "IAS 12 (Deferred Tax)",          completed: false, difficulty: "Hard"   },
            { name: "IFRS 15 (Revenue)",              completed: false, difficulty: "Hard"   },
            { name: "IAS 16 (PPE)",                   completed: false, difficulty: "Medium" },
            { name: "IAS 38 (Intangibles)",           completed: false, difficulty: "Medium" },
            { name: "IAS 40 (Investment Property)",   completed: false, difficulty: "Medium" },
            { name: "IAS 23 (Borrowing Costs)",       completed: false, difficulty: "Easy"   },
            { name: "IAS 33 (EPS)",                   completed: false, difficulty: "Hard"   },
            { name: "IAS 20 (Gov Grants)",            completed: false, difficulty: "Easy"   },
            { name: "IAS 21 (Foreign Exchange)",      completed: false, difficulty: "Medium" }
        ],
        "Core Topics": [
            { name: "CONCEPTUAL FRAMEWORK",           completed: false, difficulty: "Medium" },
            { name: "FS PREPARATION",                 completed: false, difficulty: "Hard"   },
            { name: "CONSOLIDATION",                  completed: false, difficulty: "Hard"   },
            { name: "CASHFLOW STATEMENT",             completed: false, difficulty: "Hard"   },
            { name: "INTERPRETATION",                 completed: false, difficulty: "Hard"   }
        ]
    };
}

window.showWhatsNewPopup = async function() {
    let features = [];
    let description = '';
    try {
        const res = await fetch('version.json?t=' + new Date().getTime());
        const data = await res.json();
        features = data.features;
        description = data.description || '';
    } catch(e) {
        console.warn('Could not fetch version details, using fallback.', e);
        description = "Welcome to AcademicPulse v1.0.62! This update focuses on critical stability, smarter data caching, and rich improvements to our clientside PDF report generation tools.";
        features = [
            "<div style='margin-bottom:8px'><b>&#128170; Workout Mode Refinements</b></div><b>Intelligent Field Constraints:</b> The source bank filter now automatically disables unsupported external options for the CSEB course tracking view, preventing configuration errors.<br/><br/><b>Smoother Dropdowns:</b> Enhanced the database routing hooks to ensure a cleaner, more responsive subtopic list population when picking subjects.",
            "<div style='margin-bottom:8px'><b>&#128269; Integrated Report Analyzer Fixes</b></div><b>Strict PDF Parsing:</b> Upgraded the embedded Report Analyzer within the Analytics hub to prevent processing crashes caused by missing colon formatting identifiers in incoming text streams.",
            "<div style='margin-bottom:8px'><b>&#128196; Massively Enhanced PDF Reports</b></div><b>Richer Metrics Array:</b> Lifetime Study Reports have been completely overhauled to bundle contextual summary counts, exact historical streaks, mock exam accuracies, and card workout metrics safely into a single document layout.<br/><br/><b>Weekly Subject Progress Correction:</b> The progression percentage tracking within the Study PDF export has been corrected to compute strictly against your active weekly hour allocations rather than duplicating lifetime totals.<br/><br/><b>Granular Monthly & Attendance Reports:</b> Monthly report prints now append discrete per-subject hours alongside raw calendar markings, while Attendance exports incorporate a dedicated weekly progress matrix.",
            "<div style='margin-bottom:8px'><b>&#9889; Performance & Logic Tuning</b></div><b>Aggressive Memory Caching:</b> Implemented an internal aggregate memory cache wrapper to completely bypass expensive loops. The app now blocks redundant matrix paint routines unless true mutations occur in your local data tables.<br/><br/><b>Flawless Timezone Grouping:</b> Reconfigured the calendar baseline calculations to enforce strict local timezone tracking, aligning weekly metrics and charts to correctly group days from Sunday through Saturday without boundary bleeding."
        ];
    }
    const contentDiv = document.getElementById('whatsNewModalContent');
    if(contentDiv) {
        let html = '';
        if (description) {
            html += `<p style="margin-bottom: 20px;">${description}</p>`;
        }
        html += `<ul style="list-style-type: none; padding-left: 0; display: grid; gap: 15px;">`;
        html += features.map(f => `<li style="margin-bottom: 10px;">${f}</li>`).join('');
        html += `</ul>`;
        contentDiv.innerHTML = html;
        const modal = document.getElementById('whatsNewModal');
        if (modal) modal.classList.add('active');
    }
};

function saveData(key) {
    if (key === 'subjects' || key === 'all') Storage.set(STORAGE_KEYS.SUBJECTS, AppState.subjects);
    if (key === 'attendance' || key === 'all') Storage.set(STORAGE_KEYS.ATTENDANCE, AppState.attendance);
    if (key === 'sessions' || key === 'all') {
        Storage.set(STORAGE_KEYS.SESSIONS, AppState.sessions);
        rebuildAnalyticsCache();
    }
    if (key === 'goals' || key === 'all') Storage.set(STORAGE_KEYS.GOALS, AppState.goals);
    if (key === 'accaTopics' || key === 'all') Storage.set(STORAGE_KEYS.ACCA_TOPICS, AppState.accaTopics);
    if (key === 'mocks' || key === 'all') Storage.set(STORAGE_KEYS.MOCKS, AppState.mockTests);
    if (key === 'practice' || key === 'all') Storage.set(STORAGE_KEYS.PRACTICE, AppState.questionPractice);
    if (key === 'csebSyllabus' || key === 'all') Storage.set(STORAGE_KEYS.CSEB_SYLLABUS, AppState.csebSyllabus);
    if (key === 'notifications' || key === 'all') Storage.set(STORAGE_KEYS.NOTIFICATIONS, AppState.notifications);
    if (key === 'schedule' || key === 'all') Storage.set(STORAGE_KEYS.SCHEDULE, AppState.schedule);
    if (key === 'achievements' || key === 'all') Storage.set(STORAGE_KEYS.ACHIEVEMENTS, AppState.achievements);
    if (key === 'workout' || key === 'all') Storage.set(STORAGE_KEYS.WORKOUT, AppState.workoutQuestions);
    if (key === 'workoutStats' || key === 'all') Storage.set('cseb_workout_stats', AppState.workoutStats);
    if (key === 'system' || key === 'all') Storage.set(STORAGE_KEYS.SYSTEM_STATE, {
        currentVersion: AppState.currentVersion,
        availableUpdate: AppState.availableUpdate,
        dataVersion: AppState.dataVersion
    });

    if (key === 'sessions' || key === 'mocks' || key === 'all') {
        setTimeout(checkAchievements, 100);
    }

    if (typeof window.triggerCloudSync === 'function') {
        window.triggerCloudSync();
    }
}

function checkAchievements() {
    const hasAchievement = (id) => AppState.achievements.some(a => a.id === id);
    const unlock = (id, title, desc, icon) => {
        if (!hasAchievement(id)) {
            AppState.achievements.push({ id, title, desc, icon, dateUnlocked: new Date().toISOString() });
            saveData('achievements');
            addNotification('🏆 Achievement Unlocked!', `${title}: ${desc}`, 'success');
            updateAchievementsBanners();
        }
    };

    // 1. The 100-Hour Club
    let totalMinutes = AppState.sessions.reduce((acc, s) => {
        if(s.durationMinutes !== undefined) return acc + s.durationMinutes;
        if(s.duration) return acc + Math.floor(s.duration / 60);
        return acc;
    }, 0);
    if (totalMinutes >= 6000) {
        unlock('100_hours', 'The 100-Hour Club', 'You have logged over 100 hours of study time.', '💯');
    }

    // 2. Flawless Week
    const streaks = calculateStreaks();
    if (streaks.current >= 7) {
        unlock('flawless_week', 'Flawless Week', 'You hit your daily goal 7 days in a row.', '🔥');
    }

    // 3. Mock Master (Single Subject)
    const mocksBySubj = {};
    AppState.mockTests.forEach(m => {
        if (!m.subjectId) return;
        if (!mocksBySubj[m.subjectId]) mocksBySubj[m.subjectId] = [];
        mocksBySubj[m.subjectId].push(m);
    });
    
    Object.keys(mocksBySubj).forEach(subjId => {
        const mocks = mocksBySubj[subjId].sort((a,b) => new Date(a.date) - new Date(b.date));
        if (mocks.length >= 3) {
            const last3 = mocks.slice(-3);
            const allAbove85 = last3.every(m => (m.score / m.maxScore) >= 0.85);
            if (allAbove85) {
                const subj = AppState.subjects.find(s => s.id === subjId);
                const subjName = subj ? subj.name : 'a subject';
                unlock(`mock_master_${subjId}`, 'Mock Master', `Scored 85%+ on 3 consecutive mocks in ${subjName}.`, '🎓');
            }
        }
    });
}

function updateAchievementsBanners() {
    const bannerOverview = document.getElementById('achievementsBannerOverview');
    const bannerProfile = document.getElementById('achievementsBannerProfile');
    
    const now = new Date();
    const recent = AppState.achievements.filter(a => {
        const diff = now - new Date(a.dateUnlocked);
        return diff < 24 * 60 * 60 * 1000;
    });

    const renderHtml = (items, showDate = false) => {
        if (items.length === 0) return '';
        let html = '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom: 25px;">';
        items.forEach(a => {
            const dateStr = showDate ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 5px;">Unlocked: ${new Date(a.dateUnlocked).toLocaleDateString()}</div>` : '';
            html += `
                <div style="background: linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0.05) 100%); border: 1px solid var(--neon-gold); border-radius: 12px; padding: 15px; display:flex; align-items:center; gap:15px; box-shadow: 0 0 15px rgba(255,215,0,0.1); text-align: left;">
                    <div style="font-size: 2.5rem; filter: drop-shadow(0 0 5px rgba(255,215,0,0.5));">${a.icon}</div>
                    <div style="flex: 1;">
                        <div style="color: var(--neon-gold); font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px;">Achievement Unlocked</div>
                        <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 2px;">${a.title}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">${a.desc}</div>
                        ${dateStr}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    };

    if(bannerOverview) {
        if (recent.length > 0) bannerOverview.innerHTML = renderHtml(recent);
        else bannerOverview.innerHTML = '';
    }
    
    if(bannerProfile) {
        if (AppState.achievements.length > 0) {
            const allSorted = [...AppState.achievements].sort((a,b) => new Date(b.dateUnlocked) - new Date(a.dateUnlocked));
            bannerProfile.innerHTML = renderHtml(allSorted, true);
        } else {
            bannerProfile.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No achievements unlocked yet. Keep studying!</p>';
        }
    }
}

// ==========================================
// NAVIGATION
// ==========================================
// Lazy loading Chart.js — with race-condition guard
let _chartJsLoadPromise = null;
function loadChartJS() {
    if (window.Chart) return Promise.resolve();
    if (_chartJsLoadPromise) return _chartJsLoadPromise;
    _chartJsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = resolve;
        script.onerror = (e) => { _chartJsLoadPromise = null; reject(e); };
        document.head.appendChild(script);
    });
    return _chartJsLoadPromise;
}

window.navigateTo = function(targetId, context = null) {
    if (context) {
        sessionStorage.setItem('navigationContext', JSON.stringify(context));
    } else {
        sessionStorage.removeItem('navigationContext');
    }
    const navItem = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (navItem) navItem.click();
};

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Redirect view-analyzer to view-analytics (analyzer is now embedded there)
            const resolvedTarget = targetId === 'view-analyzer' ? 'view-analytics' : targetId;

            sections.forEach(sec => sec.classList.remove('active'));
            const targetEl = document.getElementById(resolvedTarget);
            if (targetEl) targetEl.classList.add('active');
            
            // Give focus to scroll area for keyboard navigation
            const mainContent = document.getElementById('mainContentArea');
            if (mainContent) mainContent.focus();

            // Re-render views on switch
            if (targetId === 'view-overview') debouncedRenderOverview();
            if (targetId === 'view-analytics' || targetId === 'view-analyzer') {
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) overlay.classList.add('active');
                const hideOverlay = () => { if (overlay) overlay.classList.remove('active'); };

                loadChartJS()
                    .catch(err => console.warn('Chart.js failed to load — showing analytics without charts:', err))
                    .finally(() => {
                        try {
                            debouncedRenderAnalytics();
                        } catch (e) {
                            console.error('renderAnalytics error:', e);
                        } finally {
                            hideOverlay();
                        }
                    });
            }
            if (targetId === 'view-attendance') debouncedRenderAttendance();
            if (targetId === 'view-workout') renderWorkoutBank();
            if (targetId === 'view-schedule') {
                const todayTab = document.getElementById('tabScheduleToday');
                if(todayTab) todayTab.click();
            }
            if (targetId === 'view-focus') {
                try {
                    const ctxStr = sessionStorage.getItem('navigationContext');
                    if (ctxStr) {
                        const ctx = JSON.parse(ctxStr);
                        if (ctx.subjectId) {
                            window._focusContextSubjectId = ctx.subjectId;
                            
                            let display = document.getElementById('focusContextDisplay');
                            if (!display) {
                                display = document.createElement('div');
                                display.id = 'focusContextDisplay';
                                display.style.cssText = 'color: var(--neon-blue); font-weight: bold; margin-bottom: 15px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;';
                                const container = document.querySelector('.session-setup');
                                if (container) container.insertBefore(display, container.firstChild);
                            }
                            const subj = AppState.subjects.find(s => s.id === ctx.subjectId);
                            display.textContent = subj ? `Focusing on: ${subj.name}` : '';
                            display.style.display = 'block';
                        }
                        sessionStorage.removeItem('navigationContext');
                    }
                } catch(e) {}
            }
        });
    });
}

// ==========================================
// SUBJECTS MANAGEMENT
// ==========================================
function initSubjects() {
    renderSubjects();
    
    document.getElementById('openSubjectModalBtn').addEventListener('click', () => {
        document.getElementById('subjectModalTitle').textContent = 'Add Subject';
        document.getElementById('subjectIdInput').value = '';
        document.getElementById('subjectNameInput').value = '';
        document.getElementById('subjectCourseInput').value = 'CSEB';
        document.getElementById('subjectColorInput').value = '#2997FF';
        document.getElementById('subjectPriorityInput').value = 'Medium';
        document.getElementById('subjectTargetInput').value = '5';
        document.getElementById('subjectModal').classList.add('active');
    });

    document.getElementById('closeSubjectModalBtn').addEventListener('click', () => {
        document.getElementById('subjectModal').classList.remove('active');
    });

    document.getElementById('saveSubjectBtn').addEventListener('click', () => {
        const id = document.getElementById('subjectIdInput').value;
        const name = document.getElementById('subjectNameInput').value;
        const course = document.getElementById('subjectCourseInput').value;
        const color = document.getElementById('subjectColorInput').value;
        const priority = document.getElementById('subjectPriorityInput').value;
        const target = parseFloat(document.getElementById('subjectTargetInput').value);

        if (!name) return alert("Subject name required!");

        if (id) {
            const s = AppState.subjects.find(s => s.id === id);
            if (s) {
                s.name = name;
                s.course = course;
                s.color = color;
                s.priority = priority;
                s.targetHours = target;
            }
            addNotification('Subject Updated', `Subject "${name}" has been updated.`, 'success');
        } else {
            AppState.subjects.push({ id: generateId(), name, course, color, priority, targetHours: target, totalHours: 0 });
            addNotification('Subject Added', `New subject "${name}" added to ${course}.`, 'success');
        }

        saveData('subjects');
        renderSubjects();
        document.getElementById('subjectModal').classList.remove('active');
    });
}

let currentViewCourse = null;

window.selectCourseView = function(course) {
    currentViewCourse = course;
    document.getElementById('courseSelectionView').style.display = 'none';
    document.getElementById('subjectsListView').style.display = 'block';
    document.getElementById('openSubjectModalBtn').style.display = 'inline-block';
    document.getElementById('currentCourseTitle').textContent = course + ' Subjects';
    
    // Topic Tracker Visibility
    const accaContainer = document.getElementById('accaTopicTrackerContainer');
    renderSubjects();
};

window.backToCourses = function() {
    currentViewCourse = null;
    document.getElementById('courseSelectionView').style.display = 'block';
    document.getElementById('subjectsListView').style.display = 'none';
    document.getElementById('openSubjectModalBtn').style.display = 'none';
};

function renderSubjects() {
    const grid = document.getElementById('courseSubjectsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Use analyticsCache to avoid re-iterating all sessions
    if (!appCache.analytics) rebuildAnalyticsCache();
    const subjectTotals = appCache.analytics.data.subjTotals || {};

    const filteredSubjects = AppState.subjects.filter(s => s.course === currentViewCourse || (!s.course && currentViewCourse === 'CSEB'));

    filteredSubjects.forEach(subj => {
        const totalHours = ((subjectTotals[subj.id] || 0) / 3600);
        
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.style.setProperty('--sub-color', subj.color);
        card.style.cursor = 'pointer';
        card.onclick = () => window.openSyllabusModal(subj.id);
        
        let html = `
            <div class="subject-meta">
                <span class="priority-tag priority-${subj.priority}">${subj.priority} Priority</span>
            </div>
            <div class="subject-title"></div>
            <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 15px;">
                ${subj.targetHours > 0 ? `<div style="margin-bottom:4px;">Target: ${subj.targetHours}h / week</div>` : ''}
                <div>Total Studied: ${totalHours.toFixed(1)}h</div>
            </div>
        `;
        
        let syllabusTopics = null;
        let syllabusType = null;
        const currentViewCourse = subj.course || 'CSEB';
        const cleanName = subj.name.replace(/\(cseb\)|\(acca\)/gi, '').trim().toLowerCase();
        
        if (currentViewCourse === 'CSEB' && AppState.csebSyllabus) {
            const key = Object.keys(AppState.csebSyllabus).find(k => {
                const cleanK = k.toLowerCase();
                return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
            });
            if (key) {
                syllabusTopics = AppState.csebSyllabus[key];
                syllabusType = 'csebSyllabus';
            }
        } else if (currentViewCourse === 'ACCA' && AppState.accaTopics) {
            // New logic: Flatten categories to count overall
            syllabusTopics = [].concat(...Object.values(AppState.accaTopics));
            syllabusType = 'accaTopics';
        }
        
        if (syllabusTopics && syllabusTopics.length > 0) {
            let completed = 0;
            syllabusTopics.forEach(t => { if(t.completed) completed++; });
            const pct = Math.round((completed / syllabusTopics.length) * 100);
            
            html += `
                <div style="margin-bottom: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Syllabus</span>
                        <span style="font-size: 0.85rem; color: var(--neon-blue); font-weight: 600;">${pct}%</span>
                    </div>
                    <div class="progress-bar-bg" style="height: 6px; margin-bottom: 5px;">
                        <div class="progress-bar-fill fill-blue" style="width: ${pct}%"></div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-align: right;">Click to view topics</div>
                </div>
            `;
        }
        
        html += `
            <div class="subject-actions" style="margin-top: auto; padding-top: 15px; display:flex; gap:5px; flex-wrap:wrap; justify-content:center;">
                <button class="btn btn-outline" onclick="event.stopPropagation(); navigateTo('view-analytics')" style="padding: 6px 12px; font-size:0.8rem; border-color:var(--neon-purple); color:var(--neon-purple); flex:1; min-width: 100%;">View Analytics</button>
                <button class="btn btn-outline" onclick="event.stopPropagation(); editSubject('${subj.id}')" style="padding: 6px 12px; font-size:0.8rem; flex:1;">Edit</button>
                <button class="btn btn-outline" onclick="event.stopPropagation(); deleteSubject('${subj.id}')" style="padding: 6px 12px; font-size:0.8rem; color:var(--neon-red); border-color:var(--neon-red); flex:1;">Delete</button>
            </div>
        `;
        
        card.innerHTML = html;
        card.querySelector('.subject-title').textContent = subj.name;
        grid.appendChild(card);
    });
}

window.openSyllabusModal = (subjId) => {
    const subj = AppState.subjects.find(s => s.id === subjId);
    if (!subj) return;
    
    let syllabusTopics = null;
    let syllabusType = null;
    const currentViewCourse = subj.course || 'CSEB';
    const cleanName = subj.name.replace(/\(cseb\)|\(acca\)/gi, '').trim().toLowerCase();
    
    if (currentViewCourse === 'CSEB' && AppState.csebSyllabus) {
        const key = Object.keys(AppState.csebSyllabus).find(k => {
            const cleanK = k.toLowerCase();
            return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
        });
        if (key) {
            syllabusTopics = AppState.csebSyllabus[key];
            syllabusType = 'csebSyllabus';
        }
    } else if (currentViewCourse === 'ACCA' && AppState.accaTopics) {
        syllabusTopics = [].concat(...Object.values(AppState.accaTopics));
        syllabusType = 'accaTopics';
    }
    
    if (!syllabusTopics || syllabusTopics.length === 0) {
        alert("No predefined syllabus topics found for '" + subj.name + "'. Make sure the subject name matches the official syllabus name (e.g., 'Banking').");
        return;
    }
    
    document.getElementById('syllabusModalTitle').textContent = subj.name + ' Syllabus';
    
    const list = document.getElementById('syllabusModalList');
    list.innerHTML = '';
    
    let completed = 0;
    syllabusTopics.forEach(t => { if(t.completed) completed++; });
    const pct = Math.round((completed / syllabusTopics.length) * 100);
    
    document.getElementById('syllabusModalPctText').textContent = pct + '%';
    document.getElementById('syllabusModalProgress').style.width = pct + '%';
    
    syllabusTopics.forEach((topic, idx) => {
        const safeId = subj.id.replace(/[^a-zA-Z0-9]/g, '_');
        const cbId = `modal_cb_${safeId}_${idx}`;
        
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'flex-start';
        label.style.gap = '10px';
        label.style.cursor = 'pointer';
        label.style.padding = '10px 0';
        label.style.borderBottom = '1px solid var(--glass-border)';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = cbId;
        cb.checked = topic.completed;
        cb.className = 'custom-checkbox';
        cb.style.marginTop = '2px';
        
        const span = document.createElement('span');
        span.style.fontSize = '0.95rem';
        span.textContent = topic.name;
        if (topic.completed) {
            span.style.textDecoration = 'line-through';
            span.style.color = 'var(--text-muted)';
        } else {
            span.style.color = 'var(--text-main)';
        }
        
        cb.addEventListener('change', (e) => {
            topic.completed = e.target.checked;
            saveData(syllabusType);
            
            let c = 0;
            syllabusTopics.forEach(t => { if(t.completed) c++; });
            const p = Math.round((c / syllabusTopics.length) * 100);
            
            document.getElementById('syllabusModalPctText').textContent = p + '%';
            document.getElementById('syllabusModalProgress').style.width = p + '%';
            
            if (topic.completed) {
                span.style.textDecoration = 'line-through';
                span.style.color = 'var(--text-muted)';
            } else {
                span.style.textDecoration = 'none';
                span.style.color = 'var(--text-main)';
            }
            
            renderSubjects();
            debouncedRenderAnalytics();
        });
        
        label.appendChild(cb);
        label.appendChild(span);
        list.appendChild(label);
    });
    
    document.getElementById('syllabusModal').classList.add('active');
};

window.editSubject = (id) => {
    const subj = AppState.subjects.find(s => s.id === id);
    if (!subj) return;
    document.getElementById('subjectModalTitle').textContent = 'Edit Subject';
    document.getElementById('subjectIdInput').value = subj.id;
    document.getElementById('subjectNameInput').value = subj.name;
    document.getElementById('subjectCourseInput').value = subj.course || 'CSEB';
    document.getElementById('subjectColorInput').value = subj.color;
    document.getElementById('subjectPriorityInput').value = subj.priority;
    document.getElementById('subjectTargetInput').value = subj.targetHours;
    document.getElementById('subjectModal').classList.add('active');
};

window.deleteSubject = (id) => {
    if (confirm("Are you sure you want to delete this subject?")) {
        AppState.subjects = AppState.subjects.filter(s => s.id !== id);
        saveData('subjects');
        renderSubjects();
    }
};

// ==========================================
// OVERVIEW & STREAKS
// ==========================================
function calculateStreaks() {
    // Group sessions by day
    const activeDays = new Set();
    AppState.sessions.forEach(s => {
        const raw = s.startTime || s.date;
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return;
        if (d >= CUTOFF_DATE) {
            activeDays.add(TimeUtils.getDateKey(d));
        }
    });

    const sortedDays = Array.from(activeDays).sort((a,b) => new Date(b) - new Date(a));
    
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;
    
    // Sort ascending for best streak calculation
    const ascDays = Array.from(activeDays).sort((a,b) => new Date(a) - new Date(b));
    
    for (let i = 0; i < ascDays.length; i++) {
        const curDate = new Date(ascDays[i]);
        if (!lastDate) {
            tempStreak = 1;
        } else {
            const diff = Math.round((curDate - lastDate) / (1000*60*60*24));
            if (diff === 1) tempStreak++;
            else if (diff > 1) tempStreak = 1;
        }
        if (tempStreak > bestStreak) bestStreak = tempStreak;
        lastDate = curDate;
    }

    // Current Streak
    const today = new Date();
    const todayStr = TimeUtils.getDateKey(today);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
    const yesterdayStr = TimeUtils.getDateKey(yesterday);

    if (sortedDays[0] === todayStr || sortedDays[0] === yesterdayStr) {
        currentStreak = 1;
        for (let i = 0; i < sortedDays.length - 1; i++) {
            const d1 = new Date(sortedDays[i]);
            const d2 = new Date(sortedDays[i+1]);
            if ((d1 - d2) / (1000*60*60*24) === 1) currentStreak++;
            else break;
        }
    }

    return { current: currentStreak, best: bestStreak, totalActive: activeDays.size };
}

function renderOverview() {
    renderExams();
    
    const now = new Date();
    const hrs = now.getHours();
    let greeting = 'Good Evening';
    if (hrs >= 22 || hrs < 5) greeting = 'Good Night';
    else if (hrs >= 5 && hrs < 12) greeting = 'Good Morning';
    else if (hrs >= 12 && hrs < 18) greeting = 'Good Afternoon';
    
    const fbUser = window.firebaseAuth && window.firebaseAuth.currentUser;
    const name = fbUser && fbUser.displayName ? fbUser.displayName.split(' ')[0] : 'User';
    document.getElementById('greetingTitle').textContent = `${greeting}, ${name}`;
    
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById('currentDateDisplay').textContent = `${dateStr} • ${timeStr}`;

    const streaks = calculateStreaks();
    document.getElementById('studyStreakVal').textContent = streaks.current;
    document.getElementById('bestStudyStreakVal').textContent = `Best: ${streaks.best} days`;

    if (!appCache.analytics || !appCache.analytics.data) rebuildAnalyticsCache();
    const cache = appCache.analytics.data;
    
    let todaySecs = cache.todaySecs || 0;
    let weekSecs = cache.weekSecs || 0;
    let monthSecs = cache.monthSecs || 0;

    document.getElementById('todayTimeVal').textContent = TimeUtils.formatHours(todaySecs);
    document.getElementById('totalHoursVal').textContent = TimeUtils.formatHours(monthSecs);

    // Goals Progress
    // Daily
    const dGoalSecs = AppState.goals.daily * 3600;
    const dPct = Math.min(100, (todaySecs / dGoalSecs) * 100) || 0;
    document.getElementById('dailyGoalFill').style.width = `${dPct}%`;
    document.getElementById('dailyGoalText').textContent = `${(todaySecs/3600).toFixed(1)} / ${AppState.goals.daily}h`;

    // Weekly
    const wGoalSecs = AppState.goals.weekly * 3600;
    const wPct = Math.min(100, (weekSecs / wGoalSecs) * 100) || 0;
    document.getElementById('weeklyGoalFill').style.width = `${wPct}%`;
    document.getElementById('weeklyGoalText').textContent = `${(weekSecs/3600).toFixed(1)} / ${AppState.goals.weekly}h`;

    // Monthly
    const mGoalSecs = AppState.goals.monthly * 3600;
    const mPct = Math.min(100, (monthSecs / mGoalSecs) * 100) || 0;
    document.getElementById('monthlyGoalFill').style.width = `${mPct}%`;
    document.getElementById('monthlyGoalText').textContent = `${(monthSecs/3600).toFixed(1)} / ${AppState.goals.monthly}h`;

    // Recent Logs
    const tbody = document.getElementById('recentLogsTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        const recent = [...AppState.sessions].sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 5);
        
        const todayStr = TimeUtils.getDateKey(new Date());
        const now = new Date();
        const nowTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        
        if (recent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No recent sessions</td></tr>';
        } else {
            // Build all rows as a single string
            let rowsHtml = '';
            
            // 2. Regular Recent Sessions
            recent.forEach(log => {
                const subj = AppState.subjects.find(s => s.id === log.subjectId);
                const subjName = escapeHtml(subj ? subj.name : 'Uncategorized');
                const color = subj ? subj.color : '#aaa';
                const timeStr = new Date(log.startTime).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true});
                const durStr = TimeUtils.formatHours(log.duration || (log.durationMinutes ? log.durationMinutes * 60 : ((new Date(log.endTime)-new Date(log.startTime))/1000)));
                const noteOrTopic = escapeHtml([log.topic, log.notes].filter(Boolean).join(' - ') || '-');
                const focusBadge = log.isFocusMode ? `<span style="background:var(--neon-gold); color:#000; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700; margin-left:6px;">✨ FOCUS</span>` : '';
                
                rowsHtml += `
                    <tr>
                        <td style="padding:15px 10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="width:10px; height:10px; border-radius:50%; background:${color}"></div>
                                ${subjName} ${focusBadge}
                            </div>
                        </td>
                        <td style="padding:15px 10px;">${timeStr}</td>
                        <td style="padding:15px 10px; color:var(--text-muted); font-size:0.85rem;">${durStr}</td>
                        <td style="padding:15px 10px; color:var(--text-muted); font-size:0.85rem;">${noteOrTopic}</td>
                        <td style="padding:15px 10px; text-align:right; min-width: 100px;">
                            <a href="#" style="color:var(--neon-blue); margin-right:10px; font-size:0.85rem; text-decoration:none;" onclick="event.preventDefault(); editAttendance('${log.id}')">Edit</a>
                            <a href="#" style="color:var(--neon-red); font-size:0.85rem; text-decoration:none;" onclick="event.preventDefault(); deleteAttendance('${log.id}')">Delete</a>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = rowsHtml;
        }
    }
    
    // Render the dashboard widget for schedule
    renderOverviewScheduleWidget();

    // Update achievement banners
    updateAchievementsBanners();
}

// ==========================================
// ATTENDANCE
// ==========================================
function renderAttendance() {
    const grid = document.getElementById('attendanceCalendarGrid');
    if (!grid) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    document.getElementById('attendanceMonthTitle').textContent = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    grid.innerHTML = '';
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    days.forEach(d => {
        grid.innerHTML += `<div class="day-name">${d}</div>`;
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div></div>`;
    }

    let presentDays = 0;
    let totalMarked = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const status = AppState.attendance[dateKey]; // 'present', 'absent', 'leave'
        
        if (status) totalMarked++;
        if (status === 'present') presentDays++;

        const cell = document.createElement('div');
        cell.className = 'day-cell';
        if (status) cell.classList.add(`status-${status}`);
        if (day === now.getDate()) {
            cell.style.border = '2px solid white';
            cell.classList.add('selected');
        }
        
        cell.innerHTML = `<div class="day-num">${day}</div>`;
        // Click to select day and show report
        cell.addEventListener('click', () => {
            document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            renderDayReport(dateKey);
        });

        grid.appendChild(cell);
    }

    // Streak Calculation
    let attStreak = 0;
    const sortedDates = Object.keys(AppState.attendance)
        .filter(k => AppState.attendance[k] === 'present')
        .sort((a,b) => new Date(b) - new Date(a));
    
    if (sortedDates.length > 0) {
        const todayStr = TimeUtils.getDateKey(now);
        // FIX: create a new Date to avoid mutating `now` (which is reused below)
        const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = TimeUtils.getDateKey(yesterday);
        
        if (sortedDates[0] === todayStr || sortedDates[0] === yestStr) {
            attStreak = 1;
            for(let i=0; i<sortedDates.length-1; i++){
                const d1 = new Date(sortedDates[i]);
                const d2 = new Date(sortedDates[i+1]);
                if ((d1-d2)/(1000*60*60*24) === 1) attStreak++;
                else break;
            }
        }
    }

    document.getElementById('attendanceStreakVal').textContent = attStreak;
    const pct = totalMarked > 0 ? Math.round((presentDays / totalMarked) * 100) : 0;
    
    let attHtml = `${pct}%`;
    if (pct < 80 && totalMarked > 5) {
        attHtml += `<div style="margin-top:10px;"><button onclick="navigateTo('view-schedule')" style="background:var(--neon-purple); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer; width: 100%;">Plan Recovery</button></div>`;
    }
    document.getElementById('attendancePercentVal').innerHTML = attHtml;
    
    // Default to showing today's report
    renderDayReport(TimeUtils.getDateKey(now));
}

function renderExams() {
    const container = document.getElementById('examWidgetsContainer');
    if (!container) return;
    container.innerHTML = '';

    const today = new Date();
    today.setHours(0,0,0,0);

    EXAMS.forEach(exam => {
        const card = document.createElement('div');
        card.className = 'exam-card';

        if (exam.postponed) {
            card.innerHTML = `
                <div class="exam-meta">${exam.category}</div>
                <div class="exam-date" style="color:var(--text-muted); font-size:0.85rem;">Date TBA</div>
                <div class="exam-title">${exam.title}${exam.subtext ? `<br><span style="font-size:0.8rem; color:#6E6E73;">${exam.subtext}</span>` : ''}</div>
                <div class="exam-days" style="color:#FF9F0A; font-size:0.8rem; font-weight:600;">&#128337; Date Postponed</div>
            `;
        } else {
            const examDate = new Date(exam.date);
            const diffTime = examDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let daysText = diffDays > 0 ? `${diffDays} days left` : diffDays === 0 ? 'Today!' : 'Passed';
            let daysColor = diffDays > 14 ? '#30D158' : diffDays > 7 ? '#FFD60A' : diffDays >= 0 ? '#FF453A' : '#6E6E73';

            const formattedDate = examDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            card.innerHTML = `
                <div class="exam-meta">${exam.category}</div>
                <div class="exam-date">${formattedDate}</div>
                <div class="exam-title">${exam.title}${exam.subtext ? `<br><span style="font-size:0.8rem; color:#6E6E73;">${exam.subtext}</span>` : ''}</div>
                <div class="exam-days" style="color: ${daysColor}">${daysText}</div>
            `;
        }

        container.appendChild(card);
    });
}

function renderDayReport(dateKey) {
    const d = new Date(dateKey);
    const title = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('dayReportTitle').textContent = title;
    
    const btn = document.getElementById('openLogModalFromReportBtn');
    btn.style.display = 'block';
    btn.onclick = () => openLogSessionModal(dateKey);

    const daySessions = AppState.sessions.filter(s => TimeUtils.getDateKey(new Date(s.startTime)) === dateKey);
    const content = document.getElementById('dayReportContent');
    const totalDiv = document.getElementById('dayReportTotal');
    
    const currentStatus = AppState.attendance[dateKey] || 'none';
    let statusText = '';
    if (currentStatus === 'absent') statusText = '<span style="color:var(--neon-red); margin-left:10px; font-size:0.9rem;">(Marked Absent)</span>';
    if (currentStatus === 'leave') statusText = '<span style="color:var(--neon-yellow); margin-left:10px; font-size:0.9rem;">(Marked Leave)</span>';

    const statusControls = `
        <div style="margin-bottom:15px; display:flex; gap:10px;">
            <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem; flex:1;" onclick="setAttendanceStatus('${dateKey}', 'absent')">Mark Absent</button>
            <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem; flex:1;" onclick="setAttendanceStatus('${dateKey}', 'leave')">Mark Leave</button>
            <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem; flex:1;" onclick="setAttendanceStatus('${dateKey}', 'none')">Clear Status</button>
        </div>
    `;
    
    // Add Pending Scheduled Items for this day
    const now = new Date();
    const todayKey = TimeUtils.getDateKey(now);
    const nowTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    
    const pendingSchedule = AppState.schedule.filter(s => s.date === dateKey && s.status === 'pending');
    let pendingHtml = '';
    
    const formatTimeStr = (t) => {
        if (!t) return '';
        let [h, m] = t.split(':').map(Number);
        let ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m.toString().padStart(2,'0')} ${ampm}`;
    };
    
    pendingSchedule.forEach(item => {
        // Only show today's pending items (not future ones for past day views)
        if (dateKey > todayKey) return;

        const isExamRegItem = item.type === 'exam_register';
        const subj = isExamRegItem ? null : (AppState.subjects.find(sub => sub.id === item.subjectId) || null);
        const subjName = isExamRegItem ? escapeHtml(item.title || 'Exam Registration') : (subj ? escapeHtml(subj.name) : 'Unknown Subject');
        const typeLabel = isExamRegItem ? 'EXAM REG' : 'SCHEDULED';
        const typeLabelColor = isExamRegItem ? 'var(--neon-green)' : 'var(--neon-blue)';
        const borderColor = isExamRegItem ? 'var(--neon-green)' : 'var(--neon-blue)';
        const bgColor = isExamRegItem ? 'rgba(48,209,88,0.05)' : 'rgba(10,132,255,0.05)';
        const timeStr = isExamRegItem ? (item.course || '') : `${formatTimeStr(item.startTime)} - ${formatTimeStr(item.endTime)}`;
        const noteOrTopic = isExamRegItem
            ? [item.notifNo ? `Notif: ${item.notifNo}` : '', item.regNo ? `Reg: ${item.regNo}` : ''].filter(Boolean).join(' | ') || escapeHtml(item.notes || '')
            : escapeHtml([item.topic, item.title].filter(Boolean).join(' - ') || '-');
        const isTodayItem = dateKey === todayKey;
        
        pendingHtml += `
            <div class="report-session-item" style="border-left: 4px solid ${borderColor}; background: ${bgColor}; margin-bottom: 15px;">
                <div class="report-session-header" style="margin-bottom: 5px;">
                    <div>
                        <span style="font-weight:600;">${subjName}</span>
                        <span style="background:var(--glass-bg); color:${typeLabelColor}; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700; margin-left:6px; border:1px solid ${typeLabelColor};">${typeLabel}</span>
                    </div>
                    <div style="color: ${typeLabelColor}; font-size: 0.9rem;">${timeStr}</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:0.85rem; color:var(--text-muted);">${noteOrTopic}</div>
                    <div style="display:flex; gap: 5px;">
                        ${!isExamRegItem ? `<button style="background:rgba(48,209,88,0.15); color:var(--neon-green); border:none; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:0.8rem; font-weight:600;" onclick="completeScheduleItem('${item.id}')">&#10003; Log</button>` : ''}
                        ${isTodayItem ? `<button style="background:rgba(255,159,10,0.15); color:var(--neon-gold); border:none; border-radius:6px; padding:6px 8px; cursor:pointer; font-size:0.8rem; font-weight:600;" onclick="moveScheduleItemToTomorrow('${item.id}')">&#8594; Tomorrow</button>` : ''}
                        <button style="background:rgba(255,69,58,0.15); color:var(--neon-red); border:none; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:0.8rem; font-weight:600;" onclick="deleteScheduleItem('${item.id}')">&times;</button>
                    </div>
                </div>
            </div>
        `;
    });

    if (daySessions.length === 0 && !pendingHtml) {
        totalDiv.innerHTML = `Total Studied: 0h 0m ${statusText}`;
        content.innerHTML = statusControls + '<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">No sessions logged for this day.</div>';
        return;
    }

    let totalDuration = 0;
    const sessionDataForRender = [];

    daySessions.forEach(s => {
        totalDuration += (s.durationMinutes || ((new Date(s.endTime) - new Date(s.startTime)) / 60000) || 0);
        const subj = AppState.subjects.find(sub => sub.id === s.subjectId) || { name: 'Unknown', color: 'var(--text-main)' };
        
        let hrs = Math.floor(s.durationMinutes / 60) || Math.floor(totalDuration / 60); // handle old duration sec logic roughly
        if(s.durationMinutes !== undefined) {
             hrs = Math.floor(s.durationMinutes / 60);
        } else if(s.duration) {
             hrs = Math.floor(s.duration / 3600);
        }
        let mins = 0;
        if(s.durationMinutes !== undefined) {
             mins = s.durationMinutes % 60;
        } else if(s.duration) {
             mins = Math.floor((s.duration % 3600) / 60);
        }
        
        let timeStr = '';
        if (hrs > 0) timeStr += `${hrs}h `;
        timeStr += `${mins}m`;

        sessionDataForRender.push({ id: s.id, color: subj.color, subjName: subj.name, timeStr, topic: s.topic, notes: s.notes, isFocusMode: s.isFocusMode });
    });

    // Build HTML with placeholders, then fill in user-supplied text safely via textContent
    let html = sessionDataForRender.map((d, i) => `
        <div class="report-session-item" style="border-left: 4px solid ${d.color}">
            <div class="report-session-header">
                <div>
                    <span class="rsi-subj-${i}"></span>
                    ${d.isFocusMode ? `<span style="background:var(--neon-gold); color:#000; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700; margin-left:6px;">✨ FOCUS</span>` : ''}
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span style="color: var(--neon-blue);">${d.timeStr}</span>
                    <button onclick="editAttendance('${d.id}')" style="background:transparent; border:none; color:var(--neon-blue); cursor:pointer; font-size:1.1rem; padding:0; line-height:1;" title="Edit Session">✎</button>
                    <button onclick="deleteSession('${d.id}')" style="background:transparent; border:none; color:var(--neon-red); cursor:pointer; font-size:1.1rem; padding:0; line-height:1;" title="Delete Session">×</button>
                </div>
            </div>
            <div class="rsi-topic-${i}" style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;"></div>
            <div class="rsi-notes-${i} report-session-notes"></div>
        </div>
    `).join('');

    let totalHrs = 0;
    let totalMins = 0;
    
    // Calculate precise total using new durationMinutes where possible
    let sumMins = daySessions.reduce((acc, s) => {
        if(s.durationMinutes !== undefined) return acc + s.durationMinutes;
        if(s.duration) return acc + Math.floor(s.duration / 60);
        return acc;
    }, 0);
    
    totalHrs = Math.floor(sumMins / 60);
    totalMins = sumMins % 60;
    
    totalDiv.innerHTML = `Total Studied: ${totalHrs}h ${totalMins}m ${statusText}`;
    
    content.innerHTML = statusControls + pendingHtml + html;

    // Now safely populate user-controlled text via textContent (XSS-safe)
    sessionDataForRender.forEach((d, i) => {
        const subjEl = content.querySelector(`.rsi-subj-${i}`);
        if (subjEl) subjEl.textContent = d.subjName;
        
        const topicEl = content.querySelector(`.rsi-topic-${i}`);
        if (topicEl) {
            if (d.topic) {
                topicEl.textContent = `Topic: ${d.topic}`;
                topicEl.style.display = 'block';
            } else {
                topicEl.style.display = 'none';
            }
        }
        
        const notesEl = content.querySelector(`.rsi-notes-${i}`);
        if (notesEl) {
            if (d.notes) {
                notesEl.textContent = d.notes;
                notesEl.style.display = 'block';
            } else {
                notesEl.style.display = 'none';
            }
        }
    });
}


window.setAttendanceStatus = function(dateKey, status) {
    if (status === 'none') {
        delete AppState.attendance[dateKey];
    } else {
        AppState.attendance[dateKey] = status;
    }
    saveData('attendance');
    debouncedRenderAttendance();
    renderDayReport(dateKey);
    debouncedRenderAnalytics();
};

window.deleteSession = function(sessionId) {
    if (!confirm("Are you sure you want to delete this recorded session?")) return;
    
    const session = AppState.sessions.find(s => s.id === sessionId);
    if (session) {
        AppState.sessions = AppState.sessions.filter(s => s.id !== sessionId);
        saveData('sessions');
        
        const dateKey = TimeUtils.getDateKey(new Date(session.startTime));
        const remainingSessions = AppState.sessions.filter(s => TimeUtils.getDateKey(new Date(s.startTime)) === dateKey);
        if (remainingSessions.length === 0) {
            delete AppState.attendance[dateKey];
            saveData('attendance');
        }
        
        debouncedRenderOverview();
        debouncedRenderAttendance();
        debouncedRenderAnalytics();
        
        // Re-render the currently open day report
        renderDayReport(dateKey);
    }
}

// ==========================================
// ANALYTICS & INSIGHTS
// ==========================================
let dailyStudyLineChartInst = null;
let monthlyStudyBarChartInst = null;
let subjectPieChartInst = null;
let monthlyAttendanceBarChartInst = null;
let mockExamsLineChartInst = null;

let currentMockAnalyticsTab = 'ACCA';

window.setMockAnalyticsTab = function(course, el) {
    currentMockAnalyticsTab = course;
    if (el) {
        const tabs = el.parentElement.querySelectorAll('.tab');
        tabs.forEach(t => t.classList.remove('active'));
        el.classList.add('active');
    }
    
    const chartTitle = document.getElementById('mockChartTitle');
    if (chartTitle) {
        chartTitle.textContent = `Recent Mock Scores (%) - ${course}`;
        chartTitle.style.display = 'block';
    }
    
    renderMockTotals();
    renderMockExamsChart();
    renderMockAnalyticsTable();
};

window.openMockDetailedReview = function() {
    const title = document.getElementById('mockDetailedReviewModalTitle');
    if (title) title.textContent = `Detailed Review - ${currentMockAnalyticsTab}`;
    renderMockAnalyticsTable();
    document.getElementById('mockDetailedReviewModal').classList.add('active');
};

function renderMockAnalyticsTable() {
    const tbody = document.getElementById('analyticsMockTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filteredMocks = (AppState.mockTests || []).filter(m => m.course === currentMockAnalyticsTab);
    const sorted = [...filteredMocks].sort((a,b) => new Date(b.date) - new Date(a.date));
    
    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No mock exams logged for ${currentMockAnalyticsTab}</td></tr>`;
        return;
    }
    
    sorted.forEach(m => {
        const pct = Math.round((m.score / (m.maxScore || 1)) * 100);
        let color = 'var(--neon-green)';
        if (pct < 50) color = 'var(--neon-red)';
        else if (pct < 75) color = 'var(--neon-gold)';
        
        const d = new Date(m.date);
        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div style="font-weight:bold;">${dateStr}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${timeStr}</div>
            </td>
            <td>
                <div style="font-weight:bold; color:var(--text-main);">${m.syllabusArea || 'N/A'}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${m.topic || 'General Practice'}</div>
            </td>
            <td>
                <div style="font-weight:bold; color:${color}; font-size:1.1rem;">${pct}%</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${m.score} / ${m.maxScore}</div>
            </td>
            <td style="color:var(--text-muted); font-size: 0.9rem;">${m.notes || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderMockExamsChart() {
    const mockCtx = document.getElementById('mockExamsLineChart');
    if (mockCtx) {
        if (mockExamsLineChartInst) mockExamsLineChartInst.destroy();
        
        const filteredMocks = (AppState.mockTests || []).filter(m => m.course === currentMockAnalyticsTab);
        const sortedMocks = [...filteredMocks].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-10);
        
        const labels = sortedMocks.map(m => new Date(m.date).toLocaleDateString(undefined, {month:'short', day:'numeric'}));
        const data = sortedMocks.map(m => Math.max(0, Math.min(100, Math.round((m.score / (m.maxScore || 1)) * 100))));
        
        mockExamsLineChartInst = new Chart(mockCtx, {
            type: 'line',
            data: {
                labels: labels.length > 0 ? labels : ['No Data'],
                datasets: [{
                    label: 'Mock Score (%)',
                    data: data.length > 0 ? data : [0],
                    borderColor: '#FFD60A',
                    backgroundColor: 'rgba(255, 214, 10, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#FFD60A',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: 'var(--glass-border)' }, ticks: { callback: v => v+'%' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function renderAnalytics() {
    const now = new Date();

    // Lazy load analytics - only build when the user opens the tab
    rebuildAnalyticsCache();
    const cache = appCache.analytics.data;
    
    // Smart insights runs independently - don't let it crash the main render
    try { generateSmartInsights(); } catch(e) { console.warn('generateSmartInsights error:', e); }
    try { generateAICoachAnalysis('general'); } catch(e) { console.warn('generateAICoachAnalysis error:', e); }
    
    // Core aggregates
    const { totalSecs, todaySecs, weekSecs, monthSecs, subjTotals, dailyData, monthlyData } = cache;
    
    // Pre-populate last 14 days for line chart
    const last14Days = [];
    for(let i=13; i>=0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const k = TimeUtils.getDateKey(d);
        last14Days.push(k);
        if (dailyData[k] === undefined) dailyData[k] = 0;
    }
    
    // Pre-populate last 6 months for bar chart
    const last6Months = [];
    for(let i=5; i>=0; i--) {
        const d = new Date(); d.setMonth(d.getMonth()-i);
        const k = TimeUtils.getMonthKey(d);
        last6Months.push(k);
        if (monthlyData[k] === undefined) monthlyData[k] = 0;
    }

    // Overview Cards
    let streaks = { current: 0, best: 0, totalActive: 0 };
    try { streaks = calculateStreaks(); } catch(e) { console.warn('calculateStreaks error:', e); }

    const e = (id) => document.getElementById(id);
    if(e('anaTotalHours')) e('anaTotalHours').textContent = (totalSecs/3600).toFixed(1) + 'h';
    if(e('anaTodayHours')) e('anaTodayHours').textContent = (todaySecs/3600).toFixed(1) + 'h';
    if(e('anaStreak')) e('anaStreak').textContent = streaks.current;
    
    // Time Distributions
    if(e('distToday')) e('distToday').textContent = TimeUtils.formatHours(todaySecs);
    if(e('distWeek')) e('distWeek').textContent = TimeUtils.formatHours(weekSecs);
    if(e('distMonth')) e('distMonth').textContent = TimeUtils.formatHours(monthSecs);
    if(e('distAll')) e('distAll').textContent = TimeUtils.formatHours(totalSecs);
    
    if (document.getElementById('analyticsMonthTotal')) {
        document.getElementById('analyticsMonthTotal').textContent = TimeUtils.formatHours(cache.monthSecs);
    }

    // Display Last Updated timestamp
    const updatedEl = document.getElementById('analyticsLastUpdated');
    if (updatedEl && appCache.analytics) {
        const diffMins = Math.floor((Date.now() - appCache.analytics.generatedAt) / 60000);
        updatedEl.innerHTML = `Analytics Updated: <b>${diffMins === 0 ? 'Just now' : diffMins + ' min ago'}</b>`;
    }

    // Subject Analytics
    let mostSubj = null, leastSubj = null;
    let maxDur = -1, minDur = Infinity;
    Object.entries(subjTotals).forEach(([sid, dur]) => {
        if(dur > maxDur) { maxDur = dur; mostSubj = sid; }
        if(dur < minDur) { minDur = dur; leastSubj = sid; }
    });
    
    const getSubjName = (id) => { const s = AppState.subjects.find(x => x.id === id); return s ? s.name : '-'; };
    if(e('mostStudiedSubject')) {
        e('mostStudiedSubject').textContent = mostSubj ? `🏆 ${getSubjName(mostSubj)}` : '🏆 -';
        e('mostStudiedHours').textContent = mostSubj ? `${(maxDur/3600).toFixed(1)} Hours` : '0 Hours';
    }
    if(e('leastStudiedSubject')) {
        e('leastStudiedSubject').textContent = leastSubj ? `⚠️ ${getSubjName(leastSubj)}` : '⚠️ -';
        e('leastStudiedHours').textContent = leastSubj && isFinite(minDur) ? `${(minDur/3600).toFixed(1)} Hours` : '0 Hours';
    }
    
    // Subject Ranking Table
    const subjArr = Object.entries(subjTotals).map(([sid, dur]) => ({ id: sid, dur })).sort((a,b) => b.dur - a.dur);
    const tbody = document.getElementById('subjectRankingTableBody');
    if(tbody) {
        tbody.innerHTML = '';
        subjArr.forEach((item, index) => {
            let rank = index + 1;
            if (rank === 1) rank = '🏆';
            if (rank === 2) rank = '🥈';
            if (rank === 3) rank = '🥉';
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--glass-border)';
            const pct = totalSecs > 0 ? Math.round((item.dur/totalSecs)*100) : 0;
            tr.innerHTML = `<td style="padding: 12px 10px;">${rank} ${getSubjName(item.id)}</td><td style="padding: 12px 10px;">${(item.dur/3600).toFixed(1)}h</td><td style="padding: 12px 10px;">${pct}%</td>`;
            tbody.appendChild(tr);
        });
    }

    // Goal Analytics
    const dGoal = AppState.goals.daily * 3600, wGoal = AppState.goals.weekly * 3600, mGoal = AppState.goals.monthly * 3600;
    const dpct = Math.min(100, Math.round((todaySecs / dGoal) * 100)) || 0;
    const wpct = Math.min(100, Math.round((weekSecs / wGoal) * 100)) || 0;
    const mpct = Math.min(100, Math.round((monthSecs / mGoal) * 100)) || 0;
    
    if(e('anaDailyGoalTxt')) {
        e('anaDailyGoalTxt').textContent = `${(todaySecs/3600).toFixed(1)} / ${AppState.goals.daily}h (${dpct}%)`;
        e('anaDailyGoalFill').style.width = `${dpct}%`;
        e('anaWeeklyGoalTxt').textContent = `${(weekSecs/3600).toFixed(1)} / ${AppState.goals.weekly}h (${wpct}%)`;
        e('anaWeeklyGoalFill').style.width = `${wpct}%`;
        e('anaMonthlyGoalTxt').textContent = `${(monthSecs/3600).toFixed(1)} / ${AppState.goals.monthly}h (${mpct}%)`;
        e('anaMonthlyGoalFill').style.width = `${mpct}%`;
        
        e('anaGoalMetTxt').textContent = `${streaks.totalActive} Active Days`;
        e('anaGoalMetPct').textContent = AppState.sessions.length > 0 ? 'Consistent' : 'Need Data';
        
        // 30-Day Study Forecast
        const currentMonthDaysPassed = now.getDate();
        const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const avgSecsPerDay = monthSecs / currentMonthDaysPassed;
        const projectedSecs = avgSecsPerDay * totalDaysInMonth;
        if(e('ana30DayForecast')) e('ana30DayForecast').textContent = `${(projectedSecs/3600).toFixed(1)}h Projected`;
    }
    
    // Attendance Analytics
    let pres = 0, abs = 0, lev = 0;
    Object.values(AppState.attendance).forEach(val => { if(val==='present') pres++; if(val==='absent') abs++; if(val==='leave') lev++; });
    const totalAtt = pres + abs + lev;
    if(e('attPresentPct')) {
        e('attPresentPct').textContent = totalAtt ? Math.round((pres/totalAtt)*100)+'%' : '0%';
        e('attAbsentPct').textContent = totalAtt ? Math.round((abs/totalAtt)*100)+'%' : '0%';
        e('attLeavePct').textContent = totalAtt ? Math.round((lev/totalAtt)*100)+'%' : '0%';
        e('anaAttendance').textContent = totalAtt ? Math.round((pres/totalAtt)*100)+'%' : '0%';
    }

    // Focus Score
    const focusScore = Math.min(100, Math.round((todaySecs/dGoal)*60 + (streaks.current*2)));
    if(e('anaFocusScore')) e('anaFocusScore').textContent = `${focusScore}/100`;

    // --- Performance Matrix & Readiness (isolated) ---
    try {
        const performanceData = {};
        const initAreaObj = (area, course) => {
            if(!performanceData[area]) {
                performanceData[area] = {
                    course: course, area: area,
                    practiceAtt: 0, practiceCor: 0,
                    mockScores: [], mockMaxScores: [],
                    completedTopics: 0, totalTopics: 0
                };
            }
        };

        let accaTopicsCompleted = 0, totalAccaTopics = 0;
        Object.entries(AppState.accaTopics || {}).forEach(([area, topics]) => {
            if (!Array.isArray(topics)) return;
            initAreaObj(area, 'ACCA');
            topics.forEach(t => {
                performanceData[area].totalTopics++;
                totalAccaTopics++;
                if(t.completed) { performanceData[area].completedTopics++; accaTopicsCompleted++; }
            });
        });

        let csebTopicsCompleted = 0, totalCsebTopics = 0;
        Object.entries(AppState.csebSyllabus || {}).forEach(([area, topics]) => {
            if (!Array.isArray(topics)) return;
            initAreaObj(area, 'CSEB');
            topics.forEach(t => {
                performanceData[area].totalTopics++;
                totalCsebTopics++;
                if(t.completed) { performanceData[area].completedTopics++; csebTopicsCompleted++; }
            });
        });

        if (Array.isArray(AppState.questionPractice)) {
            AppState.questionPractice.forEach(p => {
                if(p.syllabusArea && p.syllabusArea !== 'General') {
                    initAreaObj(p.syllabusArea, p.course);
                    performanceData[p.syllabusArea].practiceAtt += p.attempted || 0;
                    performanceData[p.syllabusArea].practiceCor += p.correct || 0;
                }
            });
        }

        (AppState.mockTests || []).forEach(m => {
            if(m.syllabusArea && m.syllabusArea !== 'General') {
                initAreaObj(m.syllabusArea, m.course);
                performanceData[m.syllabusArea].mockScores.push(m.score);
                performanceData[m.syllabusArea].mockMaxScores.push(m.maxScore);
            }
        });

        const matrixRows = [];
        Object.values(performanceData).forEach(d => {
            d.accPct = d.practiceAtt > 0 ? Math.min(100, (d.practiceCor / d.practiceAtt) * 100) : 0;
            let sumS = 0, sumM = 0;
            d.mockScores.forEach((s, i) => { sumS += s; sumM += d.mockMaxScores[i]; });
            d.mockPct = sumM > 0 ? (sumS / sumM) * 100 : 0;
            d.sylPct = d.totalTopics > 0 ? (d.completedTopics / d.totalTopics) * 100 : 0;
            
            // Improved Accuracy & Knowledge Logic
            let compositeScore = 0;
            if (d.practiceAtt > 0 && d.mockScores.length > 0) {
                // Both available: blend them (Mocks 60%, Practice 40%)
                compositeScore = (d.accPct * 0.4) + (d.mockPct * 0.6);
            } else if (d.practiceAtt > 0) {
                // Only practice available
                compositeScore = d.accPct;
            } else if (d.mockScores.length > 0) {
                // Only mocks available
                compositeScore = d.mockPct;
            }
            
            d.compositeScore = compositeScore;
            
            let statusText = 'Need Data', color = 'var(--text-muted)';
            if (d.practiceAtt > 0 || d.mockScores.length > 0) {
                if (d.compositeScore >= 85) { statusText = 'Excellent'; color = 'var(--neon-green)'; }
                else if (d.compositeScore >= 65) { statusText = 'Good'; color = '#8ddb8d'; } // Lighter green
                else if (d.compositeScore >= 50) { statusText = 'Average'; color = 'var(--neon-gold)'; }
                else { statusText = 'Needs Work'; color = 'var(--neon-red)'; }
            }
            d.statusText = statusText; d.color = color;
            matrixRows.push(d);
        });

        const matrixBody = e('performanceMatrixBody');
        if (matrixBody) {
            matrixBody.innerHTML = '';
            if (matrixRows.length === 0) {
                matrixBody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: var(--text-muted);">No syllabus performance data yet.</td></tr>';
            } else {
                matrixRows.sort((a,b) => b.compositeScore - a.compositeScore).forEach(r => {
                    matrixBody.innerHTML += `
                        <tr style="border-bottom: 1px solid var(--glass-border);">
                            <td style="padding: 10px 5px; font-size: 0.9rem;">${r.area}</td>
                            <td style="padding: 10px 5px; color: var(--text-muted); font-size: 0.85rem;">${r.course}</td>
                            <td style="padding: 10px 5px; font-size: 0.9rem;">${r.practiceAtt > 0 ? Math.round(r.accPct)+'%' : '-'}</td>
                            <td style="padding: 10px 5px; font-size: 0.9rem;">${r.mockScores.length > 0 ? Math.round(r.mockPct)+'%' : '-'}</td>
                            <td style="padding: 10px 5px; font-size: 0.9rem;">${r.practiceAtt}</td>
                            <td style="padding: 10px 5px; text-align:right; font-weight: 500; font-size: 0.9rem; color: ${r.color};">${r.statusText}</td>
                        </tr>
                    `;
                });
            }
        }

        const weakestContainer = e('weakestAreasContainer');
        const topicRecs = e('topicRecommendationsList');
        let weakestAreas = matrixRows.filter(r => r.statusText === 'Needs Work' || r.statusText === 'Average').sort((a,b) => a.compositeScore - b.compositeScore).slice(0,3);
        
        if (weakestAreas.length === 0) {
            weakestAreas = matrixRows.filter(r => r.statusText === 'Need Data' && r.sylPct < 100).sort((a,b) => a.sylPct - b.sylPct).slice(0,3);
        }
        
        if (weakestContainer) {
            weakestContainer.innerHTML = '';
            if (weakestAreas.length === 0) {
                weakestContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">No weaknesses detected. Great job!</div>';
            } else {
                weakestAreas.forEach(w => {
                    const subjObj = AppState.subjects.find(s => s.name === w.area);
                    const subjId = subjObj ? subjObj.id : '';
                    const scoreText = w.statusText === 'Need Data' ? 'Untested (Needs Data)' : `Avg Score: ${Math.round(w.compositeScore)}%`;
                    weakestContainer.innerHTML += `
                        <div style="background: var(--glass-hover); padding: 15px; border-radius: 8px; flex: 1; min-width: 150px; border-left: 4px solid ${w.color};">
                            <div style="font-weight: bold; margin-bottom: 5px;">${w.area}</div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-size: 0.85rem; color: var(--text-muted);">${scoreText}</div>
                                ${subjId ? `<button onclick="navigateTo('view-focus', {subjectId: '${subjId}'})" style="background:var(--neon-gold); color:#000; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Practice Now</button>` : ''}
                            </div>
                        </div>
                    `;
                });
            }
        }

        if (topicRecs) {
            topicRecs.innerHTML = '';
            if (weakestAreas.length === 0) {
                topicRecs.innerHTML = '<li style="color: var(--text-muted);">Focus on completing remaining syllabus topics.</li>';
            } else {
                weakestAreas.forEach(w => {
                    const syllabusObj = w.course === 'CSEB' ? AppState.csebSyllabus : AppState.accaTopics;
                    const topics = syllabusObj[w.area] || [];
                    const hardTopics = topics.filter(t => t.difficulty === 'Hard' && !t.completed).slice(0, 2);
                    const focusTopics = hardTopics.length > 0 ? hardTopics : topics.filter(t => !t.completed).slice(0, 2);
                    focusTopics.forEach(ft => {
                        topicRecs.innerHTML += `<li><strong style="color: var(--text-main);">${w.area}:</strong> ${ft.name}</li>`;
                    });
                });
                if(topicRecs.innerHTML === '') topicRecs.innerHTML = '<li style="color: var(--text-muted);">No specific incomplete topics found in weak areas.</li>';
            }
        }

        // Readiness scores
        const getCourseConsistency = (courseName) => {
            const courseSubjects = AppState.subjects.filter(s => s.course === courseName).map(s => s.id);
            const courseSessions = AppState.sessions.filter(s => courseSubjects.includes(s.subjectId));
            const coursePractice = (AppState.questionPractice || []).filter(p => p.course === courseName);
            const courseMocks = (AppState.mockTests || []).filter(m => m.course === courseName);
            const activeDates = new Set();
            courseSessions.forEach(s => { const d = new Date(s.startTime || s.date); if(!isNaN(d)) activeDates.add(d.toDateString()); });
            coursePractice.forEach(p => { const d = new Date(p.date); if(!isNaN(d)) activeDates.add(d.toDateString()); });
            courseMocks.forEach(m => { const d = new Date(m.date); if(!isNaN(d)) activeDates.add(d.toDateString()); });
            let activeDaysInLast30 = 0;
            activeDates.forEach(dateStr => {
                const d = new Date(dateStr);
                const diff = (now - d) / (1000 * 3600 * 24);
                if(diff <= 30 && diff >= -1) activeDaysInLast30++;
            });
            return Math.min(100, (activeDaysInLast30 / 24) * 100);
        };

        const accaConsistencyPct = getCourseConsistency('ACCA');
        const csebConsistencyPct = getCourseConsistency('CSEB');
        const accaSylPct = totalAccaTopics > 0 ? (accaTopicsCompleted / totalAccaTopics) * 100 : 0;
        const csebSylPct = totalCsebTopics > 0 ? (csebTopicsCompleted / totalCsebTopics) * 100 : 0;
        const accaAreas = matrixRows.filter(r => r.course === 'ACCA');
        const accaPracAtt = accaAreas.reduce((sum, r) => sum + r.practiceAtt, 0);
        const accaPracCor = accaAreas.reduce((sum, r) => sum + r.practiceCor, 0);
        const accaPracPct = accaPracAtt > 0 ? (accaPracCor / accaPracAtt) * 100 : 0;
        let sumAMockS = 0, sumAMockM = 0;
        accaAreas.forEach(r => r.mockScores.forEach((s, i) => { sumAMockS += s; sumAMockM += r.mockMaxScores[i]; }));
        const accaMockPct = sumAMockM > 0 ? (sumAMockS / sumAMockM) * 100 : 0;
        const accaReadiness = (accaSylPct * 0.35) + (accaMockPct * 0.25) + (accaPracPct * 0.25) + (accaConsistencyPct * 0.15);
        const csebAreas = matrixRows.filter(r => r.course === 'CSEB');
        const csebPracAtt = csebAreas.reduce((sum, r) => sum + r.practiceAtt, 0);
        const csebPracCor = csebAreas.reduce((sum, r) => sum + r.practiceCor, 0);
        const csebPracPct = csebPracAtt > 0 ? (csebPracCor / csebPracAtt) * 100 : 0;
        let sumCMockS = 0, sumCMockM = 0;
        csebAreas.forEach(r => r.mockScores.forEach((s, i) => { sumCMockS += s; sumCMockM += r.mockMaxScores[i]; }));
        const csebMockPct = sumCMockM > 0 ? (sumCMockS / sumCMockM) * 100 : 0;
        const csebReadiness = (csebSylPct * 0.35) + (csebMockPct * 0.25) + (csebPracPct * 0.25) + (csebConsistencyPct * 0.15);

        if(e('readinessAcca')) e('readinessAcca').textContent = Math.min(100, Math.round(accaReadiness)) + '%';
        if(e('readinessCseb')) e('readinessCseb').textContent = Math.min(100, Math.round(csebReadiness)) + '%';
        if(e('readinessAccaBar')) e('readinessAccaBar').style.width = Math.min(100, Math.round(accaReadiness)) + '%';
        if(e('readinessCsebBar')) e('readinessCsebBar').style.width = Math.min(100, Math.round(csebReadiness)) + '%';
    } catch(perfErr) {
        console.warn('Performance matrix error (non-fatal):', perfErr);
    }

    // Charts & heatmap — each isolated
    try { renderLiveClassAnalytics(); } catch(e) { console.warn('renderLiveClassAnalytics error:', e); }
    try {
        if (window.Chart) {
            renderAnalyticsCharts(last14Days, dailyData, last6Months, monthlyData, subjArr);
        }
    } catch(e) { console.warn('renderAnalyticsCharts error:', e); }
    try { renderConsistencyHeatmap(); } catch(e) { console.warn('renderConsistencyHeatmap error:', e); }

}

let liveClassTrendChartInst = null;

function renderLiveClassAnalytics() {
    if (!appCache.analytics) rebuildAnalyticsCache();
    const lc = appCache.analytics.data.liveClass;
    if (!lc) return;

    const e = id => document.getElementById(id);

    // ── Stats Cards ────────────────────────────────────────────────
    if (e('lcTotalCount')) e('lcTotalCount').textContent = lc.totalCount;
    if (e('lcTotalHours')) e('lcTotalHours').textContent = TimeUtils.formatHours(lc.totalSecs);
    if (e('lcMonthCount')) e('lcMonthCount').textContent = lc.monthCount;
    if (e('lcAvgDur')) {
        const avg = lc.totalCount > 0 ? lc.totalSecs / lc.totalCount : 0;
        e('lcAvgDur').textContent = TimeUtils.formatHours(avg);
    }

    // ── Per-Subject Breakdown ──────────────────────────────────────
    const breakdownEl = e('liveClassSubjectBreakdown');
    if (breakdownEl) {
        const entries = Object.entries(lc.bySubject);
        if (entries.length === 0) {
            breakdownEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">No live class sessions recorded yet. Add <b>(live class)</b> in a session\'s notes to start tracking.</div>';
        } else {
            // Sort by count descending
            entries.sort((a, b) => b[1].count - a[1].count);
            const maxCount = entries[0][1].count;
            let html = '';
            entries.forEach(([subjId, data]) => {
                const subj = AppState.subjects.find(s => s.id === subjId);
                const name = subj ? escapeHtml(subj.name) : 'Unknown';
                const color = subj ? subj.color : '#0A84FF';
                const pct = Math.min(100, Math.round((data.count / maxCount) * 100));
                const hrs = TimeUtils.formatHours(data.totalSecs);
                html += `
                    <div style="margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9rem;">
                            <span style="display:flex; align-items:center; gap:8px;">
                                <span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block; flex-shrink:0;"></span>
                                ${name}
                            </span>
                            <span style="color:var(--text-muted);">${data.count} class${data.count > 1 ? 'es' : ''} · ${hrs}</span>
                        </div>
                        <div style="height:8px; background:rgba(255,255,255,0.06); border-radius:6px; overflow:hidden;">
                            <div style="height:100%; width:${pct}%; background:${color}; border-radius:6px; transition:width 0.8s cubic-bezier(0.16,1,0.3,1);"></div>
                        </div>
                    </div>`;
            });
            breakdownEl.innerHTML = html;
        }
    }

    // ── Weekly Trend Chart (Chart.js) ──────────────────────────────
    if (!window.Chart) return;
    const trendCtx = e('liveClassTrendChart');
    if (!trendCtx) return;

    // Build last 8 weeks
    const now = new Date();
    const weekLabels = [];
    const weekCounts = [];
    for (let i = 7; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const wk = TimeUtils.getWeekKey(d);
        // Shift label date to the Sunday of that week for clarity
        const labelDate = new Date(d);
        labelDate.setDate(d.getDate() - d.getDay());
        const label = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weekLabels.push(label);
        weekCounts.push(lc.byWeek[wk] || 0);
    }

    if (liveClassTrendChartInst) liveClassTrendChartInst.destroy();
    liveClassTrendChartInst = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: weekLabels,
            datasets: [{
                label: 'Live Classes',
                data: weekCounts,
                backgroundColor: 'rgba(10, 132, 255, 0.25)',
                borderColor: '#0A84FF',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderAnalyticsCharts(last14Days, dailyData, last6Months, monthlyData, subjArr) {
    const lineCtx = document.getElementById('dailyStudyLineChart');
    if (lineCtx) {
        if (dailyStudyLineChartInst) dailyStudyLineChartInst.destroy();
        Chart.defaults.color = 'rgba(255, 255, 255, 0.6)';
        dailyStudyLineChartInst = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: last14Days.map(d => d.substr(5).replace('-','/')),
                datasets: [{ label: 'Hours', data: last14Days.map(d => (dailyData[d]/3600).toFixed(1)), borderColor: '#0A84FF', backgroundColor: 'rgba(10, 132, 255, 0.1)', borderWidth: 3, tension: 0.4, fill: true }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'var(--glass-border)' } }, x: { grid: { display: false } } } }
        });
    }
    
    const barCtx = document.getElementById('monthlyStudyBarChart');
    if (barCtx) {
        if (monthlyStudyBarChartInst) monthlyStudyBarChartInst.destroy();
        monthlyStudyBarChartInst = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: last6Months,
                datasets: [{ label: 'Hours', data: last6Months.map(m => (monthlyData[m]/3600).toFixed(1)), backgroundColor: '#BF5AF2', borderRadius: 6 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'var(--glass-border)' } }, x: { grid: { display: false } } } }
        });
    }

    // AI Suggestion Logic
    const aiSubjectEl = document.getElementById('aiSuggestedSubject');
    const aiInsightEl = document.getElementById('aiSuggestedInsight');
    
    if (aiSubjectEl && aiInsightEl) {
        if (AppState.subjects.length === 0) {
            aiSubjectEl.textContent = 'No Subjects';
            aiInsightEl.textContent = 'Add subjects to get AI recommendations.';
        } else {
            // Suggest the subject with the LEAST amount of study time today/week to keep them balanced
            const recentSubjTotals = {};
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            AppState.sessions.forEach(s => {
                const d = new Date(s.startTime);
                if (d >= sevenDaysAgo) {
                    if (!recentSubjTotals[s.subjectId]) recentSubjTotals[s.subjectId] = 0;
                    recentSubjTotals[s.subjectId] += (s.duration || (s.durationMinutes ? s.durationMinutes * 60 : 0));
                }
            });

            const subjectsScores = AppState.subjects.map(subj => {
                return { subj, recentTime: recentSubjTotals[subj.id] || 0 };
            });
            
            subjectsScores.sort((a, b) => a.recentTime - b.recentTime);
            const recommended = subjectsScores[0].subj;
            
            aiSubjectEl.textContent = recommended.name;
            
            if (subjectsScores[0].recentTime === 0) {
                aiInsightEl.innerHTML = `You haven't touched this subject in the last 7 days! <br/><b>Time for a quick revision session!</b>`;
            } else {
                aiInsightEl.innerHTML = `This is your least studied subject this week. <br/><b>Spend 30 mins to keep it fresh in your mind.</b>`;
            }
        }
    }

    const attBarCtx = document.getElementById('monthlyAttendanceBarChart');
    if (attBarCtx) {
        if (monthlyAttendanceBarChartInst) monthlyAttendanceBarChartInst.destroy();
        
        const monthlyAttData = {};
        last6Months.forEach(m => monthlyAttData[m] = 0);
        Object.keys(AppState.attendance).forEach(dateKey => {
            if (AppState.attendance[dateKey] === 'present') {
                const mKey = dateKey.substring(0, 7);
                if (monthlyAttData[mKey] !== undefined) monthlyAttData[mKey]++;
            }
        });

        monthlyAttendanceBarChartInst = new Chart(attBarCtx, {
            type: 'bar',
            data: {
                labels: last6Months,
                datasets: [{ label: 'Days Present', data: last6Months.map(m => monthlyAttData[m]), backgroundColor: '#30D158', borderRadius: 6 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 31, grid: { color: 'var(--glass-border)' } }, x: { grid: { display: false } } } }
        });
    }

    const pieCtx = document.getElementById('subjectPieChart');
    if (pieCtx) {
        if (subjectPieChartInst) subjectPieChartInst.destroy();
        
        if (!appCache.analytics || !appCache.analytics.data) rebuildAnalyticsCache();
        const cache = appCache.analytics.data;
        
        const labels = subjArr.map(s => { const b=AppState.subjects.find(x=>x.id===s.id); return b?b.name:'-'; });
        const data = subjArr.map(s => s.dur/3600);
        const colors = subjArr.map(s => { const b=AppState.subjects.find(x=>x.id===s.id); return b?b.color:'#555'; });
        subjectPieChartInst = new Chart(pieCtx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
            options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'right', labels: { color: 'var(--text-main)' } } } }
        });
    }

    renderMockExamsChart();
    renderMockTotals();
    renderMockAnalyticsTable();
}

function renderConsistencyHeatmap() {
    const grid = document.getElementById('studyHeatmap');
    if (!grid) return;

    // Ensure cache is built before reading it
    if (!appCache.analytics) rebuildAnalyticsCache();
    
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 120);
    
    const studyMap = appCache.analytics.data.dailyData || {};

    
    let bestDur = 0, bestDay = null;
    let currDate = new Date(startDate);
    let cellsHtml = '';
    
    while (currDate <= now) {
        const k = TimeUtils.getDateKey(currDate);
        const dur = studyMap[k] || 0;
        if(dur > bestDur) { bestDur = dur; bestDay = k; }
        
        let bg;
        if (dur === 0) bg = 'var(--glass-border)';
        else if (dur < 7200) bg = 'rgba(48, 209, 88, 0.3)';
        else if (dur < 18000) bg = 'rgba(48, 209, 88, 0.6)';
        else bg = 'rgba(48, 209, 88, 1)';
        
        cellsHtml += `<div class="heatmap-cell" title="${k}: ${(dur/3600).toFixed(1)}h" style="background:${bg}"></div>`;
        currDate.setDate(currDate.getDate() + 1);
    }
    
    grid.innerHTML = cellsHtml;
    
    if(document.getElementById('bestStudyDayStr')) {
        document.getElementById('bestStudyDayStr').textContent = bestDay || '-';
        document.getElementById('bestStudyDayAvg').textContent = bestDay ? `Logged ${(bestDur/3600).toFixed(1)} Hours` : 'Average: 0 Hours';
    }
}

function generateAICoachAnalysis(type) {
    const el = document.getElementById('aiCoachContent');
    if (!el) return;

    if (!AppState.sessions || AppState.sessions.length === 0) {
        el.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Start logging sessions to get AI coaching.</div>';
        return;
    }

    el.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Analyzing your data...</div>';

    // Removed artificial delay for instant responsiveness
    requestAnimationFrame(() => {
        let insight = "";
        
        // 1. Analyze Subjects & Topics
        if (!appCache.analytics || !appCache.analytics.data) rebuildAnalyticsCache();
        const subjTotals = appCache.analytics.data.subjTotals;
        
        const topicSet = new Set();
        AppState.sessions.forEach(s => {
            if (s.topic) topicSet.add(s.topic.toLowerCase());
        });
        
        let bestSubj = null; let bestTime = 0;
        let worstSubj = null; let worstTime = Infinity;
        Object.keys(subjTotals).forEach(id => {
            if(subjTotals[id] > bestTime) { bestTime = subjTotals[id]; bestSubj = id; }
            if(subjTotals[id] < worstTime) { worstTime = subjTotals[id]; worstSubj = id; }
        });
        const bName = bestSubj ? (AppState.subjects.find(s=>s.id===bestSubj)?.name || 'Unknown') : '';
        const wName = worstSubj ? (AppState.subjects.find(s=>s.id===worstSubj)?.name || 'Unknown') : '';

        // 2. Analyze Attendance (Last 30 Days)
        const now = new Date();
        let presentDays = 0; let totalRecordedDays = 0;
        for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const k = TimeUtils.getDateKey(d);
            if (AppState.attendance[k]) {
                totalRecordedDays++;
                if (AppState.attendance[k] === 'present') presentDays++;
            }
        }
        const attendanceRate = totalRecordedDays > 0 ? (presentDays / totalRecordedDays) * 100 : 0;

        // 3. Analyze Mock Tests
        let avgMockScore = 0;
        if (AppState.mockTests && AppState.mockTests.length > 0) {
            const recentMocks = AppState.mockTests.slice(-3);
            const totalScore = recentMocks.reduce((acc, m) => acc + (m.score / (m.maxScore || 1)), 0);
            avgMockScore = (totalScore / recentMocks.length) * 100;
        }

        // 4. Analyze Schedule (Last 7 Days)
        let scheduleCompletes = 0; let scheduleTotal = 0;
        if (AppState.schedule) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            sevenDaysAgo.setHours(0, 0, 0, 0);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);
            AppState.schedule.forEach(s => {
                const sDate = new Date(s.date);
                if (sDate >= sevenDaysAgo && sDate <= endOfToday) {
                    if (s.status !== 'missed') scheduleTotal++;
                    if (s.status === 'completed') scheduleCompletes++;
                }
            });
        }
        const scheduleRate = scheduleTotal > 0 ? (scheduleCompletes / scheduleTotal) * 100 : 0;

        // Streaks
        const streaks = calculateStreaks();

        if (type === 'general') {
            insight = `<b style="color:var(--neon-blue); font-size:1.1rem;">Holistic Performance Review</b><br/><br/>`;
            
            if (streaks.current > 0) {
                insight += `<span style="font-size:1.1rem;">🔥</span> You're riding a <b>${streaks.current}-day streak</b>! Consistency is the ultimate key to passing exams. `;
            } else {
                insight += `<span style="font-size:1.1rem;">⚠️</span> You broke your streak recently. Today is the perfect day to start a new one! `;
            }
            
            if (totalRecordedDays > 5) {
                insight += `Your 30-day attendance rate is <b>${attendanceRate.toFixed(0)}%</b>. `;
                if (attendanceRate > 80) insight += `You are showing phenomenal discipline! `;
                else insight += `Try to aim for above 80% to ensure steady progress. `;
            }

            if (topicSet.size > 0) {
                insight += `<br/><br/><span style="font-size:1.1rem;">📚</span> You've explored <b>${topicSet.size} unique topics</b> across your subjects, ensuring broad syllabus coverage. `;
            }
            
            if (avgMockScore > 0) {
                insight += `<br/><br/><span style="font-size:1.1rem;">📝</span> `;
                if (avgMockScore >= 80) insight += `Your recent mock exams average an excellent <b>${avgMockScore.toFixed(0)}%</b>. Keep up the high accuracy!`;
                else if (avgMockScore >= 60) insight += `Your recent mock exams average <b>${avgMockScore.toFixed(0)}%</b>. Try to push past the 70% mark.`;
                else insight += `Your recent mock exams average <b>${avgMockScore.toFixed(0)}%</b>. This indicates a need for deeper review of core concepts before the real exam.`;
            } else {
                insight += `<br/><br/><span style="font-size:1.1rem;">📝</span> You haven't taken any mock exams recently. Start testing your knowledge soon!`;
            }
        } else if (type === 'strengths') {
            insight = `<b style="color:var(--neon-green); font-size:1.1rem;">Your Superpowers</b><br/><br/>`;
            
            if (bName) {
                insight += `<span style="font-size:1.1rem;">⭐</span> <b>Deep Focus:</b> You have incredible dedication when studying <b>${bName}</b> (${(bestTime/3600).toFixed(1)} hours). It is clearly your strongest domain. `;
            }
            
            if (scheduleTotal > 0 && scheduleRate >= 75) {
                insight += `<br/><br/><span style="font-size:1.1rem;">⭐</span> <b>Exceptional Planner:</b> You completed <b>${scheduleRate.toFixed(0)}%</b> of your scheduled tasks this week. Your time management is top-tier! `;
            }
            
            if (avgMockScore >= 75) {
                insight += `<br/><br/><span style="font-size:1.1rem;">⭐</span> <b>Exam Readiness:</b> With a recent mock average of ${avgMockScore.toFixed(0)}%, you are proving that you can perform under pressure.`;
            } else if (streaks.best > 3) {
                insight += `<br/><br/><span style="font-size:1.1rem;">⭐</span> <b>Grit & Discipline:</b> You've proven you can maintain focus with a personal best streak of <b>${streaks.best} days</b>.`;
            }
        } else if (type === 'weaknesses') {
            insight = `<b style="color:var(--neon-red); font-size:1.1rem;">Areas for Growth</b><br/><br/>`;
            
            if (wName && wName !== bName) {
                insight += `<span style="font-size:1.1rem;">🎯</span> <b>Procrastination Alert:</b> You are heavily avoiding <b>${wName}</b> (only ${(worstTime/3600).toFixed(1)} hours). Procrastination often hides behind the subjects we find most difficult. Tackle this subject first thing tomorrow morning! `;
            }
            
            if (scheduleTotal > 0 && scheduleRate < 50) {
                insight += `<br/><br/><span style="font-size:1.1rem;">🎯</span> <b>Planning Fallacy:</b> You only completed <b>${scheduleRate.toFixed(0)}%</b> of your scheduled tasks this week. You might be scheduling too much at once. Try scheduling fewer, highly-focused blocks instead. `;
            }
            
            if (topicSet.size > 0 && topicSet.size <= 3 && Object.keys(subjTotals).length > 1) {
                insight += `<br/><br/><span style="font-size:1.1rem;">🎯</span> <b>Tunnel Vision:</b> You've spent a lot of time recently but only covered <b>${topicSet.size} topics</b>. Make sure you aren't ignoring the rest of your syllabus!`;
            }
            
            if (totalRecordedDays > 5 && attendanceRate < 60) {
                insight += `<br/><br/><span style="font-size:1.1rem;">🎯</span> <b>Inconsistent Routine:</b> Your attendance rate is dropping (${attendanceRate.toFixed(0)}%). Remember, studying 2 hours every day is far better than studying 10 hours on one day!`;
            }
        }

        el.innerHTML = insight;
        
        // Highlight active button using CSS classes
        const buttons = document.querySelectorAll('.ai-coach-btn');
        buttons.forEach(b => {
            if (b.getAttribute('data-type') === type) {
                b.classList.add('active-prompt');
            } else {
                b.classList.remove('active-prompt');
            }
        });
    });
}

function generateSmartInsights() {
    const container = document.getElementById('smartInsightsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const now = new Date();
    const todayStr = TimeUtils.getDateKey(now);
    
    let html = '';

    // Data Aggregation
    let todaySecs = 0;
    const courseTotals = { CSEB: 0, ACCA: 0 };
    let morning = 0, afternoon = 0, night = 0;
    const subjLastSeen = {};

    // Pre-build subject lookup map to avoid O(n*m) .find() calls inside the loop
    const subjMap = new Map(AppState.subjects.map(s => [s.id, s]));

    AppState.sessions.forEach(s => {
        const raw = s.startTime || s.date;
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return;
        
        let dur = parseFloat(s.duration);
        if (isNaN(dur) || dur <= 0) {
            const endDate = new Date(s.endTime);
            if (!isNaN(endDate.getTime())) dur = (endDate - d) / 1000;
        }
        if (isNaN(dur) || dur <= 0 || !isFinite(dur)) return;
        
        if (TimeUtils.getDateKey(d) === todayStr) {
            todaySecs += dur;
        }

        // Time of Day (Chronotype)
        const hour = d.getHours();
        if (hour >= 5 && hour < 12) morning += dur;
        else if (hour >= 12 && hour < 17) afternoon += dur;
        else night += dur;

        // Course Distribution (Last 7 days)
        const diffDays = (now - d) / (1000 * 3600 * 24);
        if (diffDays <= 7) {
            const subj = subjMap.get(s.subjectId);
            if (subj) {
                if (subj.course === 'ACCA') courseTotals.ACCA += dur;
                else courseTotals.CSEB += dur;
            }
        }

        // Subject Neglect
        if (s.subjectId) {
            if (!subjLastSeen[s.subjectId] || d > subjLastSeen[s.subjectId]) {
                subjLastSeen[s.subjectId] = d;
            }
        }
    });

    // 1. Burnout Warning
    if (todaySecs > 10 * 3600) {
        html += `<div class="insight-box" style="border-left-color: var(--neon-red);"><strong>Burnout Warning:</strong> You've studied over ${(todaySecs/3600).toFixed(1)} hours today. Remember to rest!</div>`;
    }

    // 2. Course Distribution
    const weekTotal = courseTotals.CSEB + courseTotals.ACCA;
    if (weekTotal > 0) {
        const csebPct = Math.round((courseTotals.CSEB / weekTotal) * 100);
        const accaPct = Math.round((courseTotals.ACCA / weekTotal) * 100);
        if (csebPct > 70) {
            html += `<div class="insight-box" style="border-left-color: var(--neon-blue);"><strong>Course Focus:</strong> You've dedicated ${csebPct}% of your time to CSEB this week.</div>`;
        } else if (accaPct > 70) {
            html += `<div class="insight-box" style="border-left-color: var(--neon-blue);"><strong>Course Focus:</strong> You've dedicated ${accaPct}% of your time to ACCA this week.</div>`;
        } else if (csebPct > 0 && accaPct > 0) {
            html += `<div class="insight-box" style="border-left-color: var(--neon-blue);"><strong>Balanced Focus:</strong> You're splitting your time between CSEB (${csebPct}%) and ACCA (${accaPct}%).</div>`;
        }
    }

    // 3. Consistency & Momentum
    const streaks = calculateStreaks();
    if (streaks.current >= 3) {
        html += `<div class="insight-box" style="border-left-color: var(--neon-gold);"><strong>Strong Momentum:</strong> You've logged sessions for ${streaks.current} consecutive days. Keep it up!</div>`;
    }

    // 4. Time of Day Analysis
    const totalTimeOfDay = morning + afternoon + night;
    if (totalTimeOfDay > 0) {
        const maxTime = Math.max(morning, afternoon, night);
        if (maxTime === night && (night / totalTimeOfDay) > 0.5) {
            html += `<div class="insight-box" style="border-left-color: #BF5AF2;"><strong>Night Owl:</strong> Over 50% of your deep work happens after 5 PM.</div>`;
        } else if (maxTime === morning && (morning / totalTimeOfDay) > 0.5) {
            html += `<div class="insight-box" style="border-left-color: #FFD60A;"><strong>Morning Focus:</strong> You are most productive before noon!</div>`;
        } else if (maxTime === afternoon && (afternoon / totalTimeOfDay) > 0.5) {
            html += `<div class="insight-box" style="border-left-color: #FF9F0A;"><strong>Afternoon Grind:</strong> Most of your studying happens in the afternoon.</div>`;
        }
    }

    // 5. Subject Neglect Warning
    let neglectCount = 0;
    AppState.subjects.forEach(subj => {
        if (neglectCount >= 2) return; // limit to 2 warnings
        const lastSeen = subjLastSeen[subj.id];
        if (lastSeen) {
            const daysSince = Math.floor((now - lastSeen) / (1000 * 3600 * 24));
            if (daysSince >= 5 && subj.priority === 'High') {
                html += `<div class="insight-box" style="border-left-color: var(--neon-red);"><strong>Review Needed:</strong> You haven't studied High Priority subject '${escapeHtml(subj.name)}' in ${daysSince} days.</div>`;
                neglectCount++;
            }
        }
    });

    if (html === '') {
        html = '<div class="insight-box" style="color:var(--text-muted); border-left-color: var(--text-muted);">Log more sessions to generate smart insights!</div>';
    }
    
    container.innerHTML = html;
}

// ==========================================
// RETROSPECTIVE LOGGING
// ==========================================
function initRetrospectiveLogging() {
    document.getElementById('closeLogModalBtn').addEventListener('click', () => {
        document.getElementById('logSessionModal').classList.remove('active');
        window._isLoggingFocusSession = false;
    });

    // Live preview: when both start & end times are set, show calculated duration
    const updateLogPreview = () => {
        const startVal = document.getElementById('logStartTimeInput').value;
        const endVal = document.getElementById('logEndTimeInput').value;
        const preview = document.getElementById('logTimeDurationPreview');
        if (startVal && endVal) {
            const [sh, sm] = startVal.split(':').map(Number);
            const [eh, em] = endVal.split(':').map(Number);
            let totalMins = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMins <= 0) totalMins += 24 * 60; // overnight
            const calcH = Math.floor(totalMins / 60);
            const calcM = totalMins % 60;
            preview.style.display = 'block';
            preview.textContent = `⏱ Live Duration: ${calcH}h ${calcM}m (overrides manual entry)`;
            document.getElementById('logHoursInput').value = calcH;
            document.getElementById('logMinutesInput').value = calcM;
        } else {
            preview.style.display = 'none';
        }
    };
    // Use 'input' event (fires on every keystroke/scroll) instead of 'change' (fires only on blur)
    document.getElementById('logStartTimeInput').addEventListener('input', updateLogPreview);
    document.getElementById('logEndTimeInput').addEventListener('input', updateLogPreview);
    // Also keep change as fallback for browsers that only fire change on time pickers
    document.getElementById('logStartTimeInput').addEventListener('change', updateLogPreview);
    document.getElementById('logEndTimeInput').addEventListener('change', updateLogPreview);

    document.getElementById('saveLogBtn').addEventListener('click', () => {
        const dateKey = document.getElementById('logDateInput').value;
        const subjectId = document.getElementById('logSubjectInput').value;
        const topic = document.getElementById('logTopicDropdown').value;
        const notes = document.getElementById('logNotesInput').value;
        const hours = parseInt(document.getElementById('logHoursInput').value) || 0;
        const minutes = parseInt(document.getElementById('logMinutesInput').value) || 0;
        
        if (!dateKey || !subjectId) return alert('Date and Subject are required.');
        
        const durationSecs = (hours * 3600) + (minutes * 60);
        if (durationSecs <= 0) return alert('Duration must be greater than 0.');

        // Use start/end time if provided, otherwise use current time
        const startTimeVal = document.getElementById('logStartTimeInput').value;
        const endTimeVal = document.getElementById('logEndTimeInput').value;
        let sessionStart, sessionEnd;

        const [yy, mm, dd] = dateKey.split('-').map(Number);

        if (startTimeVal) {
            const [sh, sm] = startTimeVal.split(':').map(Number);
            sessionStart = new Date(yy, mm - 1, dd, sh, sm, 0, 0);
        } else {
            const now = new Date();
            sessionStart = new Date(yy, mm - 1, dd, now.getHours(), now.getMinutes(), now.getSeconds());
        }

        if (endTimeVal) {
            const [eh, em] = endTimeVal.split(':').map(Number);
            sessionEnd = new Date(yy, mm - 1, dd, eh, em, 0, 0);
            if (sessionEnd <= sessionStart) sessionEnd.setDate(sessionEnd.getDate() + 1); // overnight
        } else {
            sessionEnd = new Date(sessionStart.getTime() + (durationSecs * 1000));
        }

        AppState.sessions.push({
            id: generateId(),
            subjectId: subjectId,
            topic: topic,
            notes: notes,
            startTime: sessionStart.toISOString(),
            endTime: sessionEnd.toISOString(),
            duration: durationSecs,
            isFocusMode: window._isLoggingFocusSession || false
        });
        
        window._isLoggingFocusSession = false; // Reset the flag
        
        if (window._completingScheduleId) {
            const schedItem = AppState.schedule.find(s => s.id === window._completingScheduleId);
            if (schedItem) {
                schedItem.status = 'completed';
                saveData('schedule');
                
                // Automatically tick off the topic from the syllabus if one was selected
                if (topic && subjectId) {
                    const subj = AppState.subjects.find(s => s.id === subjectId);
                    if (subj) {
                        const cleanName = subj.name.replace(/\(cseb\)|\(acca\)/gi, '').trim().toLowerCase();
                        let syllabusType = null;
                        let syllabusTopics = null;
                        
                        const courseCode = document.getElementById('logCourseInput').value;
                        if (courseCode === 'CSEB' && AppState.csebSyllabus) {
                            const key = Object.keys(AppState.csebSyllabus).find(k => {
                                const cleanK = k.toLowerCase();
                                return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
                            });
                            if (key) {
                                syllabusTopics = AppState.csebSyllabus[key];
                                syllabusType = 'csebSyllabus';
                            }
                        } else if (courseCode === 'ACCA' && AppState.accaTopics) {
                            // Find which area holds this topic
                            Object.keys(AppState.accaTopics).forEach(area => {
                                const t = AppState.accaTopics[area].find(x => (x.name || x.topic || x) === topic);
                                if (t) {
                                    syllabusTopics = AppState.accaTopics[area];
                                    syllabusType = 'accaTopics';
                                }
                            });
                        }
                        
                        if (syllabusTopics && syllabusType) {
                            const targetTopic = syllabusTopics.find(t => (t.name || t.topic || t) === topic);
                            if (targetTopic && !targetTopic.completed) {
                                targetTopic.completed = true;
                                saveData(syllabusType);
                            }
                        }
                    }
                }
            }
            window._completingScheduleId = null;
        }

        // Mark present
        AppState.attendance[dateKey] = 'present';
        
        saveData('sessions');
        saveData('attendance');
        
        const subjObj = AppState.subjects.find(s => s.id === subjectId);
        const subjName = subjObj ? subjObj.name : 'Unknown';
        addNotification('Session Logged', `Logged ${(durationSecs / 3600).toFixed(1)} hours for ${subjName}.`, 'success');
        
        document.getElementById('logSessionModal').classList.remove('active');
        rebuildAnalyticsCache(true); // Force cache invalidation on new session
        debouncedRenderOverview();
        debouncedRenderAttendance();
        renderDayReport(dateKey);
        debouncedRenderAnalytics();
    });

    document.getElementById('logCourseInput').addEventListener('change', (e) => {
        populateLogSubjects(e.target.value);
    });

    document.getElementById('logSubjectInput').addEventListener('change', (e) => {
        populateLogTopics(e.target.value);
    });
}

function populateLogSubjects(course) {
    const select = document.getElementById('logSubjectInput');
    select.innerHTML = '';
    const filtered = AppState.subjects.filter(s => s.course === course || (!s.course && course === 'CSEB'));
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        select.appendChild(opt);
    });
    if(filtered.length > 0) {
        populateLogTopics(filtered[0].id);
    } else {
        document.getElementById('logTopicDropdown').innerHTML = '<option value="">-- No Topics --</option>';
    }
}

function populateLogTopics(subjId) {
    const topicDropdown = document.getElementById('logTopicDropdown');
    topicDropdown.innerHTML = '<option value="">-- Select a Topic (Optional) --</option>';
    
    const subj = AppState.subjects.find(s => s.id === subjId);
    if (!subj) return;
    
    let syllabusTopics = null;
    const currentViewCourse = subj.course || 'CSEB';
    const cleanName = subj.name.replace(/\(cseb\)|\(acca\)/gi, '').trim().toLowerCase();
    
    if (currentViewCourse === 'CSEB' && AppState.csebSyllabus) {
        const key = Object.keys(AppState.csebSyllabus).find(k => {
            const cleanK = k.toLowerCase();
            return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
        });
        if (key) syllabusTopics = AppState.csebSyllabus[key];
    } else if (currentViewCourse === 'ACCA' && AppState.accaTopics) {
        syllabusTopics = [].concat(...Object.values(AppState.accaTopics));
    }
    
    if (syllabusTopics && syllabusTopics.length > 0) {
        syllabusTopics.forEach(t => {
            const name = t.name || t.topic || t;
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            topicDropdown.appendChild(opt);
        });
    } else {
        topicDropdown.innerHTML = '<option value="">-- No predefined syllabus --</option>';
    }
}

function openLogSessionModal(dateKey) {
    document.getElementById('logDateInput').value = dateKey;
    document.getElementById('logNotesInput').value = '';
    document.getElementById('logHoursInput').value = '1';
    document.getElementById('logMinutesInput').value = '0';
    document.getElementById('logStartTimeInput').value = '';
    document.getElementById('logEndTimeInput').value = '';
    document.getElementById('logTimeDurationPreview').style.display = 'none';
    
    const courseInput = document.getElementById('logCourseInput');
    courseInput.value = 'CSEB'; // Default
    populateLogSubjects('CSEB');
    
    document.getElementById('logSessionModal').classList.add('active');
}

// ==========================================
// EDIT GOALS
// ==========================================
function initEditGoals() {
    document.getElementById('openEditGoalsBtn').addEventListener('click', () => {
        document.getElementById('goalDailyInput').value = AppState.goals.daily;
        document.getElementById('goalWeeklyInput').value = AppState.goals.weekly;
        document.getElementById('goalMonthlyInput').value = AppState.goals.monthly;
        document.getElementById('editGoalsModal').classList.add('active');
    });

    document.getElementById('closeEditGoalsBtn').addEventListener('click', () => {
        document.getElementById('editGoalsModal').classList.remove('active');
    });

    document.getElementById('saveGoalsBtn').addEventListener('click', () => {
        AppState.goals.daily = parseInt(document.getElementById('goalDailyInput').value) || 8;
        AppState.goals.weekly = parseInt(document.getElementById('goalWeeklyInput').value) || 40;
        AppState.goals.monthly = parseInt(document.getElementById('goalMonthlyInput').value) || 160;
        
        saveData('goals');
        debouncedRenderOverview();
        document.getElementById('editGoalsModal').classList.remove('active');
        addNotification('Goals Updated', 'Your study goals have been updated.', 'info');
    });
}

// ==========================================
// THEME MANAGEMENT
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-theme');
    
    const btn = document.getElementById('themeToggleBtn');
    if(btn) {
        btn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            btn.textContent = isLight ? 'Dark Mode' : 'Light Mode';
        });
        btn.textContent = savedTheme === 'light' ? 'Dark Mode' : 'Light Mode';
    }
}

// ==========================================
// INITIALIZATION
// ==========================================
function rebuildAnalyticsCache(force = false) {
    const currentHash = AppState.sessions.length + "-" + (AppState.sessions.length > 0 ? AppState.sessions[AppState.sessions.length - 1].id : "empty");
    
    // Memory Cache hit check
    if (!force && appCache.analytics && appCache.analytics.version === appCache.analyticsVersion && appCache.sessionsHash === currentHash) {
        return; // Bypass expensive O(n) loop!
    }

    const cacheData = {
        totalSecs: 0,
        todaySecs: 0,
        weekSecs: 0,
        monthSecs: 0,
        subjTotals: {},
        dailyData: {},
        monthlyData: {},
        liveClass: {
            totalCount: 0,
            totalSecs: 0,
            monthCount: 0,
            bySubject: {},
            byWeek: {}
        }
    };
    
    const now = new Date();
    const todayKey = TimeUtils.getDateKey(now);
    const thisWeekKey = TimeUtils.getWeekKey(now);
    const thisMonthKey = TimeUtils.getMonthKey(now);
    
    AppState.sessions.forEach(s => {
        const rawStart = s.startTime || s.date;
        if (!rawStart) return; 

        const startDate = new Date(rawStart);
        if (isNaN(startDate.getTime())) return; 

        const dKey = TimeUtils.getDateKey(startDate);
        const wKey = TimeUtils.getWeekKey(startDate);
        const mKey = TimeUtils.getMonthKey(startDate);

        // Fortified duration parsing to strictly prevent NaN/Infinity
        let dur = parseFloat(s.duration);
        if (isNaN(dur) || dur <= 0) {
            const endDate = new Date(s.endTime);
            if (!isNaN(endDate.getTime())) {
                dur = (endDate - startDate) / 1000;
            }
        }
        if (isNaN(dur) || dur <= 0 || !isFinite(dur)) return; 
        
        cacheData.totalSecs += dur;
        if (dKey === todayKey) cacheData.todaySecs += dur;
        if (wKey === thisWeekKey) cacheData.weekSecs += dur;
        if (mKey === thisMonthKey) cacheData.monthSecs += dur;
        
        if (s.subjectId) cacheData.subjTotals[s.subjectId] = (cacheData.subjTotals[s.subjectId] || 0) + dur;
        cacheData.dailyData[dKey] = (cacheData.dailyData[dKey] || 0) + dur;
        cacheData.monthlyData[mKey] = (cacheData.monthlyData[mKey] || 0) + dur;

        if (/\(live class\)/i.test(s.notes || '')) {
            const lc = cacheData.liveClass;
            lc.totalCount++;
            lc.totalSecs += dur;
            if (mKey === thisMonthKey) lc.monthCount++;
            lc.byWeek[wKey] = (lc.byWeek[wKey] || 0) + 1;
            if (s.subjectId) {
                if (!lc.bySubject[s.subjectId]) lc.bySubject[s.subjectId] = { count: 0, totalSecs: 0 };
                lc.bySubject[s.subjectId].count++;
                lc.bySubject[s.subjectId].totalSecs += dur;
            }
        }
    });

    appCache.sessionsHash = currentHash;
    appCache.analytics = {
        version: appCache.analyticsVersion,
        generatedAt: Date.now(),
        data: cacheData
    };
}

function migrateData() {
    if (AppState.dataVersion < 2) {
        // Migrate accaTopics from Array to Categorized Object
        if (Array.isArray(AppState.accaTopics)) {
            const oldArray = AppState.accaTopics;
            const newObj = {
                "IAS Standards": [],
                "IFRS Standards": [],
                "Consolidation": [],
                "Interpretation": [],
                "Ethics": []
            };
            
            oldArray.forEach(t => {
                const nameLower = t.name.toLowerCase();
                let cat = "IAS Standards"; // fallback
                if (nameLower.includes("ifrs")) cat = "IFRS Standards";
                else if (nameLower.includes("consolidation")) cat = "Consolidation";
                else if (nameLower.includes("interpretation")) cat = "Interpretation";
                else if (nameLower.includes("ethic")) cat = "Ethics";
                else cat = "IAS Standards";
                
                newObj[cat].push({ name: t.name, completed: t.completed, difficulty: "Medium" });
            });
            
            AppState.accaTopics = newObj;
            saveData('accaTopics');
        }
        
        // Add difficulty to CSEB syllabus if missing
        if (typeof AppState.csebSyllabus === 'object') {
            Object.keys(AppState.csebSyllabus).forEach(cat => {
                AppState.csebSyllabus[cat].forEach(t => {
                    if (!t.difficulty) t.difficulty = "Medium";
                });
            });
            saveData('csebSyllabus');
        }

        AppState.dataVersion = 2;
        saveData('system');
    }
}

window.initApp = function() {
    try {
        loadData();
        migrateData();
        rebuildAnalyticsCache(); // Must rebuild on startup for Dashboard metrics
        initTheme();
        initNavigation();
        initSubjects();
        initRetrospectiveLogging();
        initEditGoals();
        initMocksAndPractice();
        initFocusMode();
        initSchedule();
        initWorkout();
        debouncedRenderOverview();
        
        // Start live clock — only update the date/time display, not full render
        if (window._overviewInterval) clearInterval(window._overviewInterval);
        window._overviewInterval = setInterval(() => {
            if (document.getElementById('view-overview').classList.contains('active')) {
                // Only update clock display elements to avoid full re-render flicker
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const el = document.getElementById('currentDateDisplay');
                if (el) el.textContent = `${dateStr} • ${timeStr}`;
            }
        }, 30000); // Update every 30 seconds

        setTimeout(() => {
            document.getElementById('loadingOverlay').classList.remove('active');
        }, 500);
        
        const openAchBtn = document.getElementById('btnOpenAchievements');
        if (openAchBtn) {
            openAchBtn.addEventListener('click', () => {
                const modal = document.getElementById('achievementsModal');
                if (modal) modal.classList.add('active');
            });
        }

        const closeAchBtn = document.getElementById('closeAchievementsModalBtn');
        if (closeAchBtn) {
            closeAchBtn.addEventListener('click', () => {
                const modal = document.getElementById('achievementsModal');
                if (modal) modal.classList.remove('active');
            });
        }
        
    } catch (error) {
        console.error("Init Error:", error);
        document.getElementById('loadingOverlay').classList.remove('active');
    }
};

// ==========================================
// WORKOUT — Question Bank & Drill
// ==========================================

let _drillQueue = [];      // shuffled questions for current drill
let _drillIndex = 0;       // current position in queue
let _drillCorrect = 0;     // got-it count
let _drillWrong = [];      // wrong question objects
let _drillAnswerShown = false; // whether card is flipped

// ── Helpers ────────────────────────────────
function getWorkoutSubjectsForCourse(course) {
    if (course === 'ACCA') {
        return Object.values(AppState.accaTopics).flat().map(t => t.name);
    }
    // CSEB — combine subject names + syllabus area names
    const fromSubjects = AppState.subjects.filter(s => s.course === 'CSEB').map(s => s.name);
    return [...new Set([...fromSubjects, ...Object.keys(AppState.csebSyllabus)])];
}

function populateWqSubjects() {
    const course = document.getElementById('wqCourse')?.value || 'CSEB';
    const sel = document.getElementById('wqSubject');
    if (!sel) return;
    const items = getWorkoutSubjectsForCourse(course);
    sel.innerHTML = items.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    
    const sourceBank = document.getElementById('wqSourceBank');
    if (sourceBank) {
        if (course === 'CSEB') {
            sourceBank.value = 'Custom';
            sourceBank.disabled = true;
            sourceBank.style.opacity = '0.5';
        } else {
            sourceBank.disabled = false;
            sourceBank.style.opacity = '1';
        }
    }
    
    populateWqSubtopicList();
}

function populateDrillSubjects() {
    const course = document.getElementById('drillCourseSelect')?.value || 'ALL';
    const sel = document.getElementById('drillSubjectSelect');
    if (!sel) return;
    if (course === 'ALL') {
        sel.innerHTML = '<option value="ALL">All Subjects</option>';
        return;
    }
    const items = getWorkoutSubjectsForCourse(course);
    sel.innerHTML = '<option value="ALL">All Subjects</option>' +
        items.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

function populateWbSubjectFilter() {
    const course = document.getElementById('wbCourseFilter')?.value || 'ALL';
    const sel = document.getElementById('wbSubjectFilter');
    if (!sel) return;
    if (course === 'ALL') {
        sel.innerHTML = '<option value="ALL">All Subjects</option>';
        populateWbSubtopicFilter();
        return;
    }
    const items = getWorkoutSubjectsForCourse(course);
    sel.innerHTML = '<option value="ALL">All Subjects</option>' +
        items.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    
    const sourceFilter = document.getElementById('wbSourceFilter');
    if (sourceFilter) {
        if (course === 'CSEB') {
            sourceFilter.value = 'ALL';
            sourceFilter.disabled = true;
            sourceFilter.style.opacity = '0.5';
        } else {
            sourceFilter.disabled = false;
            sourceFilter.style.opacity = '1';
        }
    }
    
    populateWbSubtopicFilter();
}

function getPredefinedSubtopics(course, subject) {
    let subtopics = [];
    if (subject && subject !== 'ALL') {
        if (course === 'CSEB' && AppState.csebSyllabus && AppState.csebSyllabus[subject]) {
            subtopics = AppState.csebSyllabus[subject].map(t => t.name);
        } else if (course === 'ACCA' && AppState.accaTopics && AppState.accaTopics[subject]) {
            subtopics = AppState.accaTopics[subject].map(t => t.name);
        }
    }
    return subtopics;
}

function populateWbSubtopicFilter() {
    const course = document.getElementById('wbCourseFilter')?.value || 'ALL';
    const subject = document.getElementById('wbSubjectFilter')?.value || 'ALL';
    
    const filterSel = document.getElementById('wbSubtopicFilter');
    if (!filterSel) return;
    
    let pool = AppState.workoutQuestions;
    if (course !== 'ALL') pool = pool.filter(q => q.course === course);
    if (subject !== 'ALL') pool = pool.filter(q => q.subject === subject);
    
    let subtopics = pool.map(q => q.subtopic).filter(Boolean);
    subtopics = subtopics.concat(getPredefinedSubtopics(course, subject));
    
    const uniqueSubtopics = [...new Set(subtopics)].sort();
    
    filterSel.innerHTML = '<option value="ALL">All Subtopics</option>' + 
        uniqueSubtopics.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

function populateWqSubtopicList() {
    const course = document.getElementById('wqCourse')?.value || 'CSEB';
    const subject = document.getElementById('wqSubject')?.value || '';
    const subtopicSelect = document.getElementById('wqSubtopic');
    if (!subtopicSelect) return;
    
    let pool = AppState.workoutQuestions;
    pool = pool.filter(q => q.course === course);
    if (subject) pool = pool.filter(q => q.subject === subject);
    
    let subtopics = pool.map(q => q.subtopic).filter(Boolean);
    subtopics = subtopics.concat(getPredefinedSubtopics(course, subject));
    
    const uniqueSubtopics = [...new Set(subtopics)].sort();
    subtopicSelect.innerHTML = '<option value="">Select Subtopic... (Optional)</option>' + 
        uniqueSubtopics.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

// Auto-refresh subject filter when course changes
document.getElementById('wbCourseFilter')?.addEventListener('change', () => {
    populateWbSubjectFilter();
    renderWorkoutBank();
});
document.getElementById('wbSubjectFilter')?.addEventListener('change', () => {
    populateWbSubtopicFilter();
    renderWorkoutBank();
});

// ── Tab switching ───────────────────────────
window.switchWorkoutTab = function(tab, btn) {
    ['bank','drill'].forEach(t => {
        document.getElementById(`workout${t.charAt(0).toUpperCase()+t.slice(1)}Tab`).style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('#view-workout .workout-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.border = '1px solid transparent';
        b.style.color = 'var(--text-muted)';
    });
    if (btn) {
        btn.classList.add('active');
        btn.style.background = 'var(--glass-bg)';
        btn.style.border = '1px solid var(--glass-border)';
        btn.style.color = 'var(--text-main)';
    }
    if (tab === 'drill') {
        populateDrillSubjects();
        showDrillSetup();
    }
    if (tab === 'bank') renderWorkoutBank();
};

// ── Question Bank Render ─────────────────────
window.renderWorkoutBank = function() {
    const courseFilter = document.getElementById('wbCourseFilter')?.value || 'ALL';
    const subjFilter = document.getElementById('wbSubjectFilter')?.value || 'ALL';
    const subtopicFilter = document.getElementById('wbSubtopicFilter')?.value || 'ALL';
    const sourceFilter = document.getElementById('wbSourceFilter')?.value || 'ALL';
    const list = document.getElementById('workoutBankList');
    
    const wbSourceFilter = document.getElementById('wbSourceFilter');
    if (wbSourceFilter) {
        if (courseFilter === 'CSEB') {
            Array.from(wbSourceFilter.options).forEach(opt => {
                if (['Kaplan', 'BPP', 'Study Hub'].includes(opt.value)) {
                    opt.disabled = true;
                }
            });
            if (['Kaplan', 'BPP', 'Study Hub'].includes(sourceFilter)) {
                wbSourceFilter.value = 'ALL';
            }
        } else {
            Array.from(wbSourceFilter.options).forEach(opt => opt.disabled = false);
        }
    }

    if (!list) return;

    const qs = AppState.workoutQuestions;

    // Stats
    document.getElementById('wbTotalCount').textContent = qs.length;
    document.getElementById('wbCsebCount').textContent = qs.filter(q => q.course === 'CSEB').length;
    document.getElementById('wbAccaCount').textContent = qs.filter(q => q.course === 'ACCA').length;
    document.getElementById('wbWorkoutsDone').textContent = AppState.workoutStats.totalDone;

    let filtered = [...qs];
    if (courseFilter !== 'ALL') filtered = filtered.filter(q => q.course === courseFilter);
    if (subjFilter !== 'ALL') filtered = filtered.filter(q => q.subject === subjFilter);
    if (subtopicFilter !== 'ALL') filtered = filtered.filter(q => q.subtopic === subtopicFilter);
    if (sourceFilter !== 'ALL') filtered = filtered.filter(q => q.sourceBank === sourceFilter);
    const sectionFilter = document.getElementById('wbSectionFilter')?.value;
    if (sectionFilter !== undefined && sectionFilter !== 'ALL') filtered = filtered.filter(q => (q.section || '') === sectionFilter);

    const sortFilter = document.getElementById('wbSortFilter')?.value || 'TOPIC';
    filtered.sort((a, b) => {
        if (sortFilter === 'DATE_DESC') {
            const dA = new Date(a.createdAt || 0).getTime();
            const dB = new Date(b.createdAt || 0).getTime();
            return dB - dA;
        } else if (sortFilter === 'DATE_ASC') {
            const dA = new Date(a.createdAt || 0).getTime();
            const dB = new Date(b.createdAt || 0).getTime();
            return dA - dB;
        } else if (sortFilter === 'TOPIC') {
            const topicA = (a.course || '') + (a.subject || '') + (a.subtopic || '');
            const topicB = (b.course || '') + (b.subject || '') + (b.subtopic || '');
            if (topicA === topicB) {
                return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
            }
            return topicA.localeCompare(topicB);
        }
        return 0;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:40px;">No questions yet. <button class="btn" onclick="openWorkoutQuestionModal()" style="margin-left:8px; padding:6px 14px;">+ Add one</button></div>`;
        return;
    }

    const diffColor = { Easy: 'var(--neon-green)', Medium: 'var(--neon-gold)', Hard: 'var(--neon-red)' };
    list.innerHTML = filtered.map((q, idx) => {
        const globalIdx = qs.indexOf(q) + 1;
        const tags = (q.tags || []).map(t => `<span style="background:rgba(41,151,255,0.12); color:var(--neon-blue); padding:2px 8px; border-radius:12px; font-size:0.72rem; margin-right:4px;">${escapeHtml(t)}</span>`).join('');
        return `
        <div class="chart-card" style="margin-bottom:12px; padding:16px 20px;" id="wq-card-${q.id}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">Q${globalIdx}</span>
                        <span style="background:rgba(41,151,255,0.15); color:var(--neon-blue); padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">${escapeHtml(q.course)}</span>
                        <span style="background:rgba(100,100,100,0.15); color:var(--text-muted); padding:2px 8px; border-radius:10px; font-size:0.72rem;">${escapeHtml(q.subject)}</span>
                        ${q.section ? `<span style="background:rgba(180,100,255,0.15); color:#c77dff; border:1px solid rgba(180,100,255,0.35); padding:2px 9px; border-radius:10px; font-size:0.72rem; font-weight:700;">§ ${escapeHtml(q.section)}</span>` : ''}
                        ${q.createdAt ? `<span style="font-size:0.7rem; color:var(--text-muted); margin-left:4px;">${q.createdAt.split('T')[0]}</span>` : ''}
                        ${q.subtopic ? `<span style="background:rgba(200,200,200,0.15); color:var(--text-muted); padding:2px 8px; border-radius:10px; font-size:0.72rem;">↳ ${escapeHtml(q.subtopic)}</span>` : ''}
                        <span style="color:${diffColor[q.difficulty] || 'var(--text-muted)'}; font-size:0.72rem; font-weight:700;">${q.difficulty}</span>
                        ${q.sourceBank && q.sourceBank !== 'Custom' ? `<span style="background:var(--glass-hover); color:var(--neon-gold); padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">${escapeHtml(q.sourceBank)}</span>` : ''}
                        ${tags}
                    </div>
                    ${q.ref ? `<div style="font-size:0.85rem; color:var(--neon-green); font-weight:700; margin-bottom:6px;">Ref: ${escapeHtml(q.ref)}</div>` : ''}
                    <div style="font-weight:600; font-size:0.95rem; line-height:1.4; margin-bottom:8px;">${escapeHtml(q.question)}</div>
                    <details style="cursor:pointer;">
                        <summary style="font-size:0.82rem; color:var(--neon-green); font-weight:600; user-select:none;">▶ Show Answer</summary>
                        <div style="margin-top:8px; padding:10px; background:rgba(48,209,88,0.06); border-radius:8px; font-size:0.88rem; line-height:1.5; color:var(--text-main);">${escapeHtml(q.answer)}</div>
                    </details>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
                    <button onclick="openWorkoutQuestionModal('${q.id}')" style="background:transparent; color:var(--neon-blue); border:1px solid var(--glass-border); border-radius:8px; padding:5px 10px; cursor:pointer; font-size:0.8rem;">✎ Edit</button>
                    <button onclick="deleteWorkoutQuestion('${q.id}')" style="background:transparent; color:var(--neon-red); border:1px solid var(--glass-border); border-radius:8px; padding:5px 10px; cursor:pointer; font-size:0.8rem;">✕ Del</button>
                </div>
            </div>
        </div>`;
    }).join('');
};

// ── Open / Save Question Modal ───────────────
window.openWorkoutQuestionModal = function(id) {
    const modal = document.getElementById('workoutQuestionModal');
    document.getElementById('workoutModalTitle').textContent = id ? 'Edit Question' : 'Add Question';
    document.getElementById('wqEditId').value = id || '';
    populateWqSubjects();

    if (id) {
        const q = AppState.workoutQuestions.find(x => x.id === id);
        if (!q) return;
        document.getElementById('wqCourse').value = q.course;
        populateWqSubjects();
        document.getElementById('wqSubject').value = q.subject;
        populateWqSubtopicList();
        document.getElementById('wqSubtopic').value = q.subtopic || '';
        document.getElementById('wqSourceBank').value = q.sourceBank || 'Custom';
        document.getElementById('wqRef').value = q.ref || '';
        document.getElementById('wqQuestion').value = q.question;
        document.getElementById('wqAnswer').value = q.answer;
        document.getElementById('wqDifficulty').value = q.difficulty || 'Medium';
        document.getElementById('wqTags').value = (q.tags || []).join(', ');
        document.getElementById('wqDate').value = q.createdAt ? q.createdAt.split('T')[0] : TimeUtils.getDateKey();
        document.getElementById('wqSection').value = q.section || '';
    } else {
        document.getElementById('wqCourse').value = 'CSEB';
        populateWqSubjects();
        document.getElementById('wqSubtopic').value = '';
        document.getElementById('wqSourceBank').value = 'Custom';
        document.getElementById('wqRef').value = '';
        document.getElementById('wqQuestion').value = '';
        document.getElementById('wqAnswer').value = '';
        document.getElementById('wqDifficulty').value = 'Medium';
        document.getElementById('wqTags').value = '';
        document.getElementById('wqDate').value = TimeUtils.getDateKey();
        document.getElementById('wqSection').value = '';
    }
    modal.classList.add('active');
};

window.mergeAndSortRefs = function(ref1, ref2) {
    if (!ref1) return ref2 || '';
    if (!ref2) return ref1 || '';
    const parts = [...ref1.split(','), ...ref2.split(',')].map(p => p.trim()).filter(Boolean);
    const uniqueParts = [...new Set(parts)];
    
    uniqueParts.sort((a, b) => {
        const numA = parseInt((a.match(/\d+/) || ['0'])[0], 10);
        const numB = parseInt((b.match(/\d+/) || ['0'])[0], 10);
        return numA - numB;
    });
    
    return uniqueParts.join(', ');
};

window.saveWorkoutQuestion = function() {
    const id = document.getElementById('wqEditId').value;
    const course = document.getElementById('wqCourse').value;
    const subject = document.getElementById('wqSubject').value;
    const subtopic = document.getElementById('wqSubtopic').value.trim();
    const sourceBank = document.getElementById('wqSourceBank').value;
    const ref = document.getElementById('wqRef').value.trim();
    let question = document.getElementById('wqQuestion').value.trim();
    let answer = document.getElementById('wqAnswer').value.trim();
    const difficulty = document.getElementById('wqDifficulty').value;
    const tags = document.getElementById('wqTags').value.split(',').map(t => t.trim()).filter(Boolean);
    const dateInput = document.getElementById('wqDate').value;
    const createdAt = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();
    const section = document.getElementById('wqSection')?.value || '';

    if (!question && ref) {
        question = `[${sourceBank}] ${ref}`;
    }
    if (!answer && ref) {
        answer = `(Refer to ${sourceBank} Question Bank for ${ref})`;
    }

    if (!question || !answer) {
        alert('Please enter a question and answer, or provide a Q Reference.');
        return;
    }

    if (id) {
        const q = AppState.workoutQuestions.find(x => x.id === id);
        if (q) { Object.assign(q, { course, subject, subtopic, section, sourceBank, ref, question, answer, difficulty, tags, createdAt, updatedAt: new Date().toISOString() }); }
    } else {
        const existing = AppState.workoutQuestions.find(q => 
            q.course === course && 
            q.subject === subject && 
            q.subtopic === subtopic && 
            q.section === section && 
            q.sourceBank === sourceBank
        );

        if (existing && ref) {
            const oldRef = existing.ref || '';
            const mergedRef = mergeAndSortRefs(oldRef, ref);
            
            const oldAutoQ = `[${existing.sourceBank}] ${oldRef}`;
            if (existing.question === oldAutoQ || !existing.question) {
                existing.question = `[${existing.sourceBank}] ${mergedRef}`;
            } else if (question !== `[${sourceBank}] ${ref}` && question) {
                existing.question += '\n\n' + question;
            }
            
            const oldAutoA = `(Refer to ${existing.sourceBank} Question Bank for ${oldRef})`;
            if (existing.answer === oldAutoA || !existing.answer) {
                existing.answer = `(Refer to ${existing.sourceBank} Question Bank for ${mergedRef})`;
            } else if (answer !== `(Refer to ${sourceBank} Question Bank for ${ref})` && answer) {
                existing.answer += '\n\n' + answer;
            }

            existing.ref = mergedRef;
            existing.updatedAt = new Date().toISOString();
        } else {
            AppState.workoutQuestions.push({
                id: generateId(), course, subject, subtopic, section, sourceBank, ref, question, answer, difficulty, tags,
                createdAt, timesAttempted: 0, timesCorrect: 0
            });
        }
    }

    // Permanently group by Topic so Q-numbers are sequential for the same topic
    AppState.workoutQuestions.sort((a, b) => {
        const topicA = (a.course || '') + (a.subject || '') + (a.subtopic || '');
        const topicB = (b.course || '') + (b.subject || '') + (b.subtopic || '');
        if (topicA === topicB) {
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        return topicA.localeCompare(topicB);
    });

    saveData('workout');
    document.getElementById('workoutQuestionModal').classList.remove('active');
    renderWorkoutBank();
    addNotification('Question Saved', `${course} · ${subject}`, 'success');
};

window.deleteWorkoutQuestion = function(id) {
    if (!confirm('Delete this question?')) return;
    AppState.workoutQuestions = AppState.workoutQuestions.filter(q => q.id !== id);
    saveData('workout');
    renderWorkoutBank();
};

// ── Drill Logic ─────────────────────────────
function showDrillSetup() {
    document.getElementById('drillSetupScreen').style.display = '';
    document.getElementById('drillActiveScreen').style.display = 'none';
    document.getElementById('drillResultsScreen').style.display = 'none';
}

window.startWorkoutDrill = function() {
    const course = document.getElementById('drillCourseSelect')?.value || 'ALL';
    const subj = document.getElementById('drillSubjectSelect')?.value || 'ALL';
    const countVal = document.getElementById('drillCountSelect')?.value || '10';

    let pool = AppState.workoutQuestions;
    if (course !== 'ALL') pool = pool.filter(q => q.course === course);
    if (subj !== 'ALL') pool = pool.filter(q => q.subject === subj);

    if (pool.length === 0) {
        alert('No questions available for this filter. Add some in the Question Bank!');
        switchWorkoutTab('bank', document.getElementById('tabWorkoutBank'));
        return;
    }

    // Shuffle
    _drillQueue = [...pool].sort(() => Math.random() - 0.5);
    if (countVal !== 'ALL') _drillQueue = _drillQueue.slice(0, parseInt(countVal));

    _drillIndex = 0;
    _drillCorrect = 0;
    _drillWrong = [];
    _drillAnswerShown = false;

    document.getElementById('drillSetupScreen').style.display = 'none';
    document.getElementById('drillActiveScreen').style.display = '';
    document.getElementById('drillResultsScreen').style.display = 'none';

    renderDrillCard();
};

function renderDrillCard() {
    const q = _drillQueue[_drillIndex];
    const total = _drillQueue.length;
    const pct = Math.round((_drillIndex / total) * 100);

    document.getElementById('drillProgressText').textContent = `Question ${_drillIndex + 1} of ${total}`;
    document.getElementById('drillScoreText').innerHTML = `✓ ${_drillCorrect} &nbsp;✗ ${_drillWrong.length}`;
    document.getElementById('drillProgressBar').style.width = pct + '%';

    document.getElementById('drillQuestionNo').textContent = `Q${AppState.workoutQuestions.indexOf(q) + 1} · ${q.course}`;
    document.getElementById('drillSubjectBadge').textContent = q.subject;
    document.getElementById('drillQuestionText').textContent = q.question;
    document.getElementById('drillAnswerText').textContent = q.answer;
    document.getElementById('drillAnswerBlock').style.display = 'none';
    document.getElementById('drillTapHint').style.display = '';
    document.getElementById('drillActionBtns').style.display = 'none';
    _drillAnswerShown = false;
}

window.toggleDrillAnswer = function() {
    if (_drillAnswerShown) return;
    _drillAnswerShown = true;
    document.getElementById('drillAnswerBlock').style.display = '';
    document.getElementById('drillTapHint').style.display = 'none';
    document.getElementById('drillActionBtns').style.display = 'flex';
};

window.markDrillQuestion = function(correct) {
    if (!_drillAnswerShown) return;
    const q = _drillQueue[_drillIndex];
    if (correct) {
        _drillCorrect++;
        q.timesCorrect = (q.timesCorrect || 0) + 1;
    } else {
        _drillWrong.push(q);
    }
    q.timesAttempted = (q.timesAttempted || 0) + 1;
    saveData('workout');

    _drillIndex++;
    if (_drillIndex >= _drillQueue.length) {
        finishDrill();
    } else {
        renderDrillCard();
    }
};

window.exitWorkoutDrill = function() { showDrillSetup(); };

function finishDrill() {
    const total = _drillQueue.length;
    const pct = total > 0 ? Math.round((_drillCorrect / total) * 100) : 0;

    AppState.workoutStats.totalDone++;
    AppState.workoutStats.totalCorrect += _drillCorrect;
    saveData('workoutStats');

    document.getElementById('drillSetupScreen').style.display = 'none';
    document.getElementById('drillActiveScreen').style.display = 'none';
    document.getElementById('drillResultsScreen').style.display = '';

    document.getElementById('drillFinalScore').textContent = `${pct}%`;

    const badge = document.getElementById('drillAccuracyBadge');
    if (pct >= 80) { badge.textContent = '🏆 Excellent!'; badge.style.background = 'rgba(48,209,88,0.2)'; badge.style.color = 'var(--neon-green)'; }
    else if (pct >= 60) { badge.textContent = '👍 Good'; badge.style.background = 'rgba(255,214,10,0.2)'; badge.style.color = 'var(--neon-gold)'; }
    else { badge.textContent = '📖 Keep Practicing'; badge.style.background = 'rgba(255,69,58,0.2)'; badge.style.color = 'var(--neon-red)'; }

    const weakDiv = document.getElementById('drillWeakList');
    if (_drillWrong.length > 0) {
        weakDiv.innerHTML = `<h4 style="color:var(--neon-red); margin-bottom:8px;">📌 Questions to Review (${_drillWrong.length})</h4>` +
            _drillWrong.map((q, i) => `<div style="background:rgba(255,69,58,0.06); border-left:3px solid var(--neon-red); padding:8px 12px; border-radius:6px; margin-bottom:6px; font-size:0.85rem;"><b>Q${i+1}:</b> ${escapeHtml(q.question)}</div>`).join('');
    } else {
        weakDiv.innerHTML = '<div style="color:var(--neon-green); text-align:center; padding:10px;">🎯 Perfect score! All correct!</div>';
    }

    document.getElementById('wbWorkoutsDone').textContent = AppState.workoutStats.totalDone;
    addNotification('Workout Done!', `Score: ${_drillCorrect}/${total} (${pct}%)`, pct >= 60 ? 'success' : 'info');
}

// ── Init ─────────────────────────────────────
function initWorkout() {
    populateWbSubjectFilter();
    renderWorkoutBank();
}

// ==========================================
// MOCKS & PRACTICE
// ==========================================
function renderPracticeTotals() {
    const attemptedTxt = document.getElementById('practiceAttemptedTxt');
    const correctTxt = document.getElementById('practiceCorrectTxt');
    
    // Check if we should filter based on dropdown selections
    const courseFilter = document.getElementById('practiceCourseInput')?.value;
    const areaFilter = document.getElementById('practiceAreaInput')?.value;
    const topicFilter = document.getElementById('practiceTopicInput')?.value;

    let totalAtt = 0, totalCor = 0;
    if (Array.isArray(AppState.questionPractice)) {
        let filteredPractice = AppState.questionPractice;
        if (courseFilter && courseFilter !== '') filteredPractice = filteredPractice.filter(p => p.course === courseFilter);
        if (areaFilter && areaFilter !== '') filteredPractice = filteredPractice.filter(p => p.syllabusArea === areaFilter);
        if (topicFilter && topicFilter !== '') filteredPractice = filteredPractice.filter(p => p.topic === topicFilter);

        filteredPractice.forEach(p => { totalAtt += p.attempted; totalCor += p.correct; });
    } else {
        totalAtt = AppState.questionPractice.attempted || 0;
        totalCor = AppState.questionPractice.correct || 0;
    }
    
    if (attemptedTxt) attemptedTxt.textContent = totalAtt;
    if (correctTxt) correctTxt.innerHTML = `${totalCor} <span style="font-size:1rem; color: var(--text-muted);">(${totalAtt > 0 ? Math.round((totalCor/totalAtt)*100) : 0}%)</span>`;
}

function initMocksAndPractice() {

    const courseSelect = document.getElementById('practiceCourseInput');
    const areaSelect = document.getElementById('practiceAreaInput');
    const topicSelect = document.getElementById('practiceTopicInput');
    
    const populatePracticeAreas = (course) => {
        if(!areaSelect) return;
        areaSelect.innerHTML = '<option value="">Select Area</option>';
        const syllabusObj = course === 'CSEB' ? AppState.csebSyllabus : AppState.accaTopics;
        const areas = Object.keys(syllabusObj);
        areas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            areaSelect.appendChild(opt);
        });
        const fallbackOpt = document.createElement('option');
        fallbackOpt.value = 'General';
        fallbackOpt.textContent = 'General';
        areaSelect.appendChild(fallbackOpt);
        
        if(topicSelect) {
            topicSelect.innerHTML = '<option value="">Select Topic</option>';
        }

        // Auto-select the first valid area to prevent an empty topics dropdown bug
        if (areas.length > 0) {
            areaSelect.selectedIndex = 1; // 1 because 0 is "Select Area"
            populatePracticeTopics(course, areas[0]);
        }
    };

    const populatePracticeTopics = (course, area) => {
        if(!topicSelect) return;
        topicSelect.innerHTML = '<option value="">Select Topic</option>';
        if(!area) return;
        const syllabusObj = course === 'CSEB' ? AppState.csebSyllabus : AppState.accaTopics;
        const topics = syllabusObj[area] || [];
        if (!Array.isArray(topics)) return;
        
        topics.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = t.name;
            topicSelect.appendChild(opt);
        });
    };
    
    if(courseSelect) {
        courseSelect.onchange = (e) => {
            populatePracticeAreas(e.target.value);
            renderPracticeTotals();
            renderPracticeHistory();
        };
        if (areaSelect) {
            areaSelect.onchange = (e) => {
                populatePracticeTopics(courseSelect.value, e.target.value);
                renderPracticeTotals();
                renderPracticeHistory();
            };
        }
        if (topicSelect) {
            topicSelect.onchange = () => {
                renderPracticeTotals();
                renderPracticeHistory();
            };
        }
        populatePracticeAreas(courseSelect.value);
    }
    
    renderPracticeTotals();
    renderPracticeHistory();

    const addBtn = document.getElementById('practiceAddBtn');
    if (addBtn) {
        addBtn.onclick = () => {
        const addAtt = parseInt(document.getElementById('practiceAddAttempted').value) || 0;
        const addCor = parseInt(document.getElementById('practiceAddCorrect').value) || 0;
        if(addAtt === 0 && addCor === 0) return;
        
        const c = document.getElementById('practiceCourseInput')?.value;
        const areaVal = document.getElementById('practiceAreaInput')?.value;
        
        if (!c || !areaVal) return alert('Please select a Course and Syllabus Area.');
        
        const topicVal = document.getElementById('practiceTopicInput')?.value || '';
        const confVal = document.getElementById('practiceConfidenceInput')?.value || 'Medium';
        const notesVal = document.getElementById('practiceNotesInput')?.value || '';
        
        if (!Array.isArray(AppState.questionPractice)) {
            // Migrate legacy object to array
            const legacyAtt = AppState.questionPractice.attempted || 0;
            const legacyCor = AppState.questionPractice.correct || 0;
            AppState.questionPractice = [];
            if(legacyAtt > 0) {
                AppState.questionPractice.push({ id: generateId(), date: new Date().toISOString(), course: 'Legacy', syllabusArea: 'General', topic: '', confidence: 'Medium', attempted: legacyAtt, correct: legacyCor });
            }
        }
        
        AppState.questionPractice.push({
            id: generateId(),
            date: new Date().toISOString(),
            course: c,
            syllabusArea: areaVal,
            topic: topicVal,
            confidence: confVal,
            attempted: addAtt,
            correct: addCor,
            notes: notesVal
        });
        
        saveData('practice');
        
        document.getElementById('practiceAddAttempted').value = '';
        document.getElementById('practiceAddCorrect').value = '';
        if(document.getElementById('practiceNotesInput')) document.getElementById('practiceNotesInput').value = '';
        renderPracticeTotals();
        renderPracticeHistory();
        debouncedRenderAnalytics();
    };
    }

    const saveMockBtn = document.getElementById('saveMockBtn');
    const mockCourseSelect = document.getElementById('mockCourseInput');
    const mockAreaSelect = document.getElementById('mockAreaInput');

    const mockTopicSelect = document.getElementById('mockTopicInput');

    const populateMockAreas = (course) => {
        if(!mockAreaSelect) return;
        mockAreaSelect.innerHTML = '<option value="">General</option>';
        const syllabusObj = course === 'CSEB' ? AppState.csebSyllabus : AppState.accaTopics;
        Object.keys(syllabusObj).forEach(area => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            mockAreaSelect.appendChild(opt);
        });
    };
    
    const populateMockTopics = (course, area) => {
        if(!mockTopicSelect) return;
        mockTopicSelect.innerHTML = '<option value="">All Topics</option>';
        const addSelect = document.getElementById('mockTopicAddSelect');
        if(addSelect) addSelect.innerHTML = '';
        if(!area || area === 'General') return;
        
        const syllabusObj = course === 'CSEB' ? AppState.csebSyllabus : AppState.accaTopics;
        const topics = syllabusObj[area];
        if (topics && Array.isArray(topics)) {
            topics.forEach(t => {
                const name = t.name || t.topic || t;
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                mockTopicSelect.appendChild(opt);
                if(addSelect) {
                    const opt2 = document.createElement('option');
                    opt2.value = name;
                    opt2.textContent = name;
                    addSelect.appendChild(opt2);
                }
            });
        }
    };

    if(mockCourseSelect) {
        mockCourseSelect.onchange = (e) => {
            populateMockAreas(e.target.value);
            populateMockTopics(e.target.value, '');
        };
        populateMockAreas(mockCourseSelect.value);
        populateMockTopics(mockCourseSelect.value, mockAreaSelect?.value || 'General');
    }
    
    if(mockAreaSelect) {
        mockAreaSelect.onchange = (e) => {
            const course = document.getElementById('mockCourseInput').value;
            populateMockTopics(course, e.target.value);
        };
    }

    if (saveMockBtn) {
        saveMockBtn.onclick = () => {
        const course = document.getElementById('mockCourseInput').value;
        const area = document.getElementById('mockAreaInput').value || 'General';
        const topic = document.getElementById('mockTopicInput')?.value || '';
        const name = document.getElementById('mockNameInput').value;
        const score = parseFloat(document.getElementById('mockScoreInput').value) || 0;
        const max = parseFloat(document.getElementById('mockMaxScoreInput').value) || 100;
        const notes = document.getElementById('mockNotesInput')?.value || '';
        let topicsCovered = [];
        try { topicsCovered = JSON.parse(document.getElementById('mockTopicsJson')?.value || '[]'); } catch(e) {}
        
        if(!name) return alert('Mock Name is required!');
        
        AppState.mockTests.push({
            id: generateId(),
            date: new Date().toISOString(),
            course: course,
            syllabusArea: area,
            topic: topic,
            topicsCovered: topicsCovered,
            name: name,
            score: score,
            maxScore: max,
            notes: notes
        });
        
        saveData('mocks');
        document.getElementById('mockNameInput').value = '';
        document.getElementById('mockScoreInput').value = '';
        if(document.getElementById('mockNotesInput')) document.getElementById('mockNotesInput').value = '';
        // reset topic tags
        const tagsContainer = document.getElementById('mockTopicTagsContainer');
        if(tagsContainer) tagsContainer.innerHTML = '';
        const topicsJson = document.getElementById('mockTopicsJson');
        if(topicsJson) topicsJson.value = '[]';
        renderMocksHistory();
        debouncedRenderAnalytics();
    };
    }

    renderMocksHistory();
}

function renderMockTotals() {
    const container = document.getElementById('analyticsMockSummary');
    if (!container) return;
    
    const mocks = AppState.mockTests || [];
    const courseMocks = mocks.filter(m => m.course === currentMockAnalyticsTab);
    
    if (courseMocks.length === 0) {
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--glass-bg); padding: 15px; border-radius: 12px; border: 1px solid var(--glass-border);">
                <div style="text-align: left;">
                    <div class="stat-label">Total Mocks Taken (${currentMockAnalyticsTab})</div>
                    <div class="stat-value">0</div>
                </div>
                <div style="text-align: right;">
                    <div class="stat-label">Average Score</div>
                    <div class="stat-value text-blue">0%</div>
                </div>
            </div>
        `;
        return;
    }
    
    let totalScorePct = 0;
    
    courseMocks.forEach(m => {
        const pct = (m.score / (m.maxScore || 1));
        totalScorePct += pct;
    });
    
    const avg = Math.round((totalScorePct / courseMocks.length) * 100);
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--glass-bg); padding: 15px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <div style="text-align: left;">
                <div class="stat-label">Total Mocks Taken (${currentMockAnalyticsTab})</div>
                <div class="stat-value">${courseMocks.length}</div>
            </div>
            <div style="text-align: right;">
                <div class="stat-label">Average Score</div>
                <div class="stat-value text-blue">${avg}%</div>
            </div>
        </div>
    `;
}

function renderMocksHistory() {
    const tbody = document.getElementById('mocksTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const sorted = [...AppState.mockTests].sort((a,b) => new Date(b.date) - new Date(a.date));
    if(sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No mock exams logged</td></tr>';
        return;
    }
    
    sorted.forEach(m => {
        const pct = Math.round((m.score / (m.maxScore || 1)) * 100);
        let color = 'var(--neon-green)';
        if(pct < 50) color = 'var(--neon-red)';
        else if(pct < 75) color = 'var(--neon-gold)';

        const topicChips = (m.topicsCovered && m.topicsCovered.length > 0)
            ? m.topicsCovered.map(t => `<span style="background:rgba(41,151,255,0.12); color:var(--neon-blue); border:1px solid rgba(41,151,255,0.3); padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600; margin-right:4px;">${escapeHtml(t)}</span>`).join('')
            : '';
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--glass-border)';
        tr.innerHTML = `
            <td style="padding:15px 10px;">${new Date(m.date).toLocaleDateString()}</td>
            <td style="padding:15px 10px;">
                <div class="mock-name-title" style="font-weight: 600; color: var(--text-main);"></div>
                <div style="font-size: 0.8em; color: var(--text-muted); margin-top: 4px;">
                    ${m.course} - ${m.syllabusArea}
                    ${m.topic && m.topic !== 'All Topics' && m.topic !== '' ? ' &bull; ' + m.topic : ''}
                </div>
                ${topicChips ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">${topicChips}</div>` : ''}
            </td>
            <td style="padding:15px 10px;">${m.score} / ${m.maxScore} (<span style="color:${color}; font-weight:700;">${pct}%</span>)</td>
            <td style="padding:15px 10px; text-align:right; min-width: 150px;">
                <a href="#" style="color:var(--neon-blue); margin-right:8px; font-size:0.85rem; text-decoration:none;" onclick="event.preventDefault(); editMock('${m.id}')">Edit</a>
                <a href="#" style="color:var(--neon-red); font-size:0.85rem; text-decoration:none;" onclick="event.preventDefault(); deleteMock('${m.id}')">Delete</a>
            </td>
        `;
        tr.querySelector('.mock-name-title').textContent = m.name;
        tbody.appendChild(tr);
    });
}

window.addEventListener('storage', (event) => {
    if (Object.values(STORAGE_KEYS).includes(event.key)) {
        loadData();
        rebuildAnalyticsCache(); // Ensure cache is fresh after external data change
        debouncedRenderOverview();
        if (document.getElementById('view-analytics') && document.getElementById('view-analytics').classList.contains('active')) {
            debouncedRenderAnalytics();
        }
    }
});
// ==========================================
// REPORT ANALYZER
// ==========================================

const pdfDropZone = document.getElementById('pdfDropZone');
const pdfFileInput = document.getElementById('pdfFileInput');
const analyzerLoading = document.getElementById('analyzerLoading');
const analyzerResults = document.getElementById('analyzerResults');

if(pdfDropZone) {
    pdfDropZone.addEventListener('click', () => pdfFileInput.click());
    pdfDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pdfDropZone.style.background = 'var(--glass-hover)'; });
    pdfDropZone.addEventListener('dragleave', () => { pdfDropZone.style.background = 'transparent'; });
    pdfDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        pdfDropZone.style.background = 'transparent';
        if(e.dataTransfer.files && e.dataTransfer.files[0]) {
            processPDF(e.dataTransfer.files[0]);
        }
    });
    
    pdfFileInput.addEventListener('change', (e) => {
        if(e.target.files && e.target.files[0]) {
            processPDF(e.target.files[0]);
        }
    });
}

async function processPDF(file) {
    if(file.type !== 'application/pdf') {
        alert("Please upload a valid PDF file.");
        return;
    }
    
    pdfDropZone.style.display = 'none';
    analyzerLoading.style.display = 'block';
    analyzerResults.style.display = 'none';
    
    try {
        // Load pdf.js from unpkg if not already loaded
        if (!window.pdfjsLib) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.min.js';
                script.onload = resolve;
                script.onerror = () => {
                    // Fallback to cdnjs
                    const script2 = document.createElement('script');
                    script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
                    script2.onload = resolve;
                    script2.onerror = reject;
                    document.head.appendChild(script2);
                };
                document.head.appendChild(script);
            });
        }

        const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        if (!pdfjsLib) throw new Error('pdf.js library could not be loaded.');

        // Use fake worker to avoid CORS issues with worker scripts
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ 
            data: new Uint8Array(arrayBuffer),
            disableWorker: true
        });
        const pdf = await loadingTask.promise;
        
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += pageText + " ";
        }
        
        if (!fullText.trim()) {
            throw new Error('No text could be extracted from this PDF.');
        }
        
        analyzeReportText(fullText);
    } catch (error) {
        console.error("PDF Parsing Error:", error);
        pdfDropZone.style.display = 'block';
        analyzerLoading.style.display = 'none';
        alert("Could not read the PDF. Error: " + (error.message || error));
    }
}


function analyzeReportText(text) {
    let totalHours = 0;
    let attendance = 0;
    
    const hoursMatch1 = text.match(/Total\s*Lifetime\s*Study\s*Hours:?\s*([\d\.]+)\s*h/i);
    const hoursMatch2 = text.match(/Total\s*Hours\s*this\s*Month:?\s*([\d\.]+)\s*h/i);
    if(hoursMatch1) totalHours = parseFloat(hoursMatch1[1]);
    else if(hoursMatch2) totalHours = parseFloat(hoursMatch2[1]);
    
    const attMatch = text.match(/Attendance\s*Percentage:?\s*(\d+)%/i);
    if(attMatch) attendance = parseInt(attMatch[1]);
    
    document.getElementById('analyzerHours').textContent = totalHours > 0 ? `${totalHours}h` : 'N/A';
    document.getElementById('analyzerAttendance').textContent = attendance > 0 ? `${attendance}%` : 'N/A';
    
    const suggestions = [];
    
    if(totalHours === 0 && attendance === 0) {
        suggestions.push("<li>We couldn't detect enough data in this report. Make sure you are uploading a valid Study or Monthly report exported from the app.</li>");
    } else {
        if(totalHours < 10) {
            suggestions.push("<li><strong>Increase Study Volume:</strong> Your total hours are quite low. Try using the Pomodoro Focus timer to commit to at least 2 solid hours a day.</li>");
        } else if(totalHours > 50) {
            suggestions.push("<li><strong>Great Dedication:</strong> You have logged a massive amount of study hours! Make sure you are also taking breaks to avoid burnout.</li>");
        } else {
            suggestions.push("<li><strong>Consistent Effort:</strong> You are maintaining a steady pace. Look into your individual Subject targets to see if any specific area needs more focus.</li>");
        }
        
        if(attendance > 0) {
            if(attendance < 75) {
                suggestions.push("<li><strong>Improve Attendance:</strong> Your attendance is below 75%. Falling behind in classes can make studying much harder. Try to minimize leaves.</li>");
            } else if(attendance >= 90) {
                suggestions.push("<li><strong>Excellent Attendance:</strong> You have a fantastic attendance record! This builds a strong foundation for your exams.</li>");
            } else {
                suggestions.push("<li><strong>Stable Attendance:</strong> Your attendance is solid. Keep showing up to class!</li>");
            }
        }
        
        suggestions.push("<li><strong>Action Item:</strong> Review the subjects with the lowest progress in your Dashboard and dedicate your next study session entirely to them.</li>");
    }
    
    document.getElementById('analyzerSuggestions').innerHTML = suggestions.join('');
    
    analyzerLoading.style.display = 'none';
    analyzerResults.style.display = 'block';
    
    if(!document.getElementById('resetAnalyzerBtn')) {
        const resetBtn = document.createElement('button');
        resetBtn.id = 'resetAnalyzerBtn';
        resetBtn.className = 'btn btn-outline';
        resetBtn.style.marginTop = '20px';
        resetBtn.style.width = '100%';
        resetBtn.textContent = 'Analyze Another Report';
        resetBtn.onclick = () => {
            analyzerResults.style.display = 'none';
            pdfDropZone.style.display = 'block';
        };
        analyzerResults.appendChild(resetBtn);
    }
}

// ==========================================
// NOTIFICATIONS SYSTEM
// ==========================================
function addNotification(title, message, type = 'info') {
    const notif = {
        id: generateId(),
        title,
        message,
        type,
        timestamp: new Date().toISOString(),
        read: false
    };
    AppState.notifications.unshift(notif);
    if (AppState.notifications.length > 50) AppState.notifications.pop();
    saveData('notifications');
    renderNotifications();
}

function renderNotifications() {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;
    
    // Clear All binding
    const clearBtn = document.getElementById('clearNotifsBtn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            AppState.notifications = [];
            saveData('notifications');
            renderNotifications();
        };
    }
    
    container.innerHTML = '';
    
    if (AppState.notifications.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 40px;">No notifications yet. Activity will appear here.</div>';
        return;
    }
    
    AppState.notifications.forEach(n => {
        let color = 'var(--neon-blue)';
        let icon = '🔔';
        if (n.type === 'success') { color = 'var(--neon-green)'; icon = '✅'; }
        if (n.type === 'warning') { color = 'var(--neon-red)'; icon = '⚠️'; }
        if (n.type === 'goal') { color = 'var(--neon-gold)'; icon = '🎯'; }
        
        const div = document.createElement('div');
        div.style.background = 'var(--glass-bg)';
        div.style.border = '1px solid var(--glass-border)';
        div.style.borderLeft = `4px solid ${color}`;
        div.style.padding = '18px 20px';
        div.style.borderRadius = '12px';
        div.className = 'notif-card hover-lift'; 
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: var(--text-main); font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
                    ${icon} <span class="noti-title"></span>
                </strong>
                <small style="color: var(--text-muted); font-size: 0.8rem;">${new Date(n.timestamp).toLocaleString()}</small>
            </div>
            <p class="noti-desc" style="margin: 8px 0 0 0; color: var(--text-muted); font-size: 0.95rem; line-height: 1.4;"></p>
        `;
        div.querySelector('.noti-title').textContent = n.title;
        div.querySelector('.noti-desc').textContent = n.message;
        container.appendChild(div);
    });
}

// ==========================================
// SEARCH SYSTEM
// ==========================================
let currentSearchFilter = 'all';

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderSearchResults(e.target.value);
        }, 300);
    });
    
    const filterBtns = document.querySelectorAll('.search-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => { b.classList.remove('active-filter'); b.classList.add('btn-outline'); });
            e.target.classList.remove('btn-outline');
            e.target.classList.add('active-filter');
            currentSearchFilter = e.target.getAttribute('data-filter');
            renderSearchResults(searchInput.value);
        });
    });
    
    // Initial render
    renderSearchResults('');
}

function createResultCard(type, title, subtitle, meta, details, color) {
    const card = document.createElement('div');
    card.style.background = 'var(--glass-bg)';
    card.style.border = '1px solid var(--glass-border)';
    card.style.borderTop = `4px solid ${color}`;
    card.style.padding = '20px';
    card.style.borderRadius = '12px';
    card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    card.style.cursor = 'pointer';
    
    let typeBadge = '';
    if (type === 'session') typeBadge = '<span style="font-size: 0.75rem; background: rgba(10, 132, 255, 0.1); color: var(--neon-blue); padding: 3px 8px; border-radius: 12px;">Session</span>';
    if (type === 'mock') typeBadge = '<span style="font-size: 0.75rem; background: rgba(255, 69, 58, 0.1); color: var(--neon-red); padding: 3px 8px; border-radius: 12px;">Mock Test</span>';
    if (type === 'subject') typeBadge = '<span style="font-size: 0.75rem; background: rgba(48, 209, 88, 0.1); color: var(--neon-green); padding: 3px 8px; border-radius: 12px;">Subject</span>';

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <div style="color: var(--text-muted); font-size: 0.85rem;">${meta}</div>
            ${typeBadge}
        </div>
        <div class="search-title" style="color: var(--text-main); font-weight: 600; font-size: 1.1rem; margin-bottom: 6px;"></div>
        <div style="color: ${color}; font-weight: 500; font-size: 0.9rem;">${subtitle}</div>
        <div class="search-desc" style="color: var(--text-muted); font-size: 0.9rem; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);"></div>
    `;

    card.querySelector('.search-title').textContent = title;

    const descEl = card.querySelector('.search-desc');
    if (details) {
        const isLong = details.length > 100;
        const shortText = isLong ? details.substring(0, 100) + '...' : details;
        
        const em = document.createElement('em');
        em.className = 'search-notes-text';
        em.textContent = shortText;
        descEl.appendChild(em);

        if (isLong) {
            const btn = document.createElement('div');
            btn.className = 'search-expand-btn';
            btn.style.cssText = 'color: var(--neon-blue); font-size: 0.8rem; margin-top: 5px; font-weight: 500; cursor: pointer;';
            btn.textContent = 'Show More ▾';
            descEl.appendChild(btn);

            let expanded = false;
            card.addEventListener('click', () => {
                expanded = !expanded;
                if (expanded) {
                    em.textContent = details;
                    btn.textContent = 'Show Less ▴';
                } else {
                    em.textContent = shortText;
                    btn.textContent = 'Show More ▾';
                }
            });
        }
    } else {
        descEl.style.display = 'none';
    }

    return card;
}

function renderSearchResults(query) {
    const container = document.getElementById('searchResultsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    // Reset grid when using section-based layout
    container.style.display = 'block';
    const q = query.trim().toLowerCase();
    
    if (q.length === 0 && currentSearchFilter === 'all') {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center; border: 1px dashed var(--glass-border); border-radius: 12px;">Type above to search, or select a category filter to browse...</div>';
        return;
    }

    // Netflix-style normalization: convert & to and, remove special chars, tokenize
    const normalizeForSearch = (str) => {
        if (!str) return '';
        return str.toLowerCase()
                  .replace(/&/g, 'and')
                  .replace(/[^a-z0-9 ]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
    };
    
    const normQ = normalizeForSearch(q);
    const searchTerms = normQ.split(' ').filter(t => t.length > 0);
    
    // Helper to check if any string matches all search terms
    const matchesSearch = (...fields) => {
        if (searchTerms.length === 0) return true;
        const combinedTarget = fields.map(f => normalizeForSearch(f)).join(' ');
        return searchTerms.every(term => combinedTarget.includes(term));
    };

    // Detect live class sessions (case-insensitive)
    const isLiveClass = (notes) => /\(live class\)/i.test(notes || '');
    
    // ---- Live Class filter mode: group by subject → chapter ----
    if (currentSearchFilter === 'live-class') {
        const liveSessions = AppState.sessions.filter(s => isLiveClass(s.notes));

        if (liveSessions.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No live class sessions found. Add <b>(live class)</b> in the notes of a session to track it here.</div>';
            return;
        }

        // Filter by search query too
        const filtered = liveSessions.filter(s => {
            const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
            return searchTerms.length === 0 || matchesSearch(subj ? subj.name : '', s.notes, s.topic);
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No live class sessions match your search.</div>';
            return;
        }

        // ── Chapter root normalizer ─────────────────────────────────
        // Strips trailing part/episode/section numbers so "Chapter 1 Part 1"
        // and "Chapter 1 Part 2" both resolve to root "Chapter 1".
        const getChapterRoot = (topic, notes) => {
            const raw = (topic || notes || '').replace(/\(live class\)/gi, '').trim();
            return raw
                // Remove trailing "Part 1", "Pt 2", "Episode 3", "Ep.4", "(1)", "- 2", "1/2" etc.
                .replace(/[\s\-–—]*(\bpart\b|\bpt\.?\b|\bepisode\b|\bep\.?\b|\bsection\b|\bseg\b|\blecture\b|\blec\b|\bclass\b)\s*[\d]+\s*$/i, '')
                .replace(/[\s\-–—]*\([\d]+\)\s*$/i, '')  // trailing (1), (2)
                .replace(/[\s\-–—]*[\d]+\s*\/\s*[\d]+\s*$/i, '')  // trailing 1/2, 2/3
                .replace(/[\s\-–—]+[\d]+\s*$/i, '')  // trailing bare number "Chapter 3 2"
                .trim() || raw;  // fallback to raw if stripping removed everything
        };

        // Extract part label from topic
        const getPartLabel = (topic, notes) => {
            const raw = (topic || notes || '').replace(/\(live class\)/gi, '').trim();
            const m = raw.match(/(\bpart\b|\bpt\.?\b|\bepisode\b|\bep\.?\b|\bsection\b|\blecture\b)\s*([\d]+)/i)
                      || raw.match(/\(([\d]+)\)/)
                      || raw.match(/([\d]+)\s*\/\s*([\d]+)/);
            if (m) return m[0];
            // Bare trailing number
            const n = raw.match(/[\s\-–—]+([\d]+)\s*$/);
            if (n) return n[1];
            return null;
        };

        // Group: subject → chapter root → sessions[]
        const bySubject = {};
        filtered.forEach(s => {
            const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
            const subjKey = subj ? subj.id : '__unknown__';
            if (!bySubject[subjKey]) bySubject[subjKey] = { subj, chapters: {} };
            const root = getChapterRoot(s.topic, s.notes);
            if (!bySubject[subjKey].chapters[root]) bySubject[subjKey].chapters[root] = [];
            bySubject[subjKey].chapters[root].push(s);
        });

        // ── Render helper: one individual session card ──────────────
        const makeSessionCard = (s, subjColor) => {
            const dateStr = new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = new Date(s.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const durStr = s.duration ? TimeUtils.formatHours(s.duration) : '-';
            const cleanNotes = (s.notes || '').replace(/\(live class\)/gi, '').trim();
            const partLabel = getPartLabel(s.topic, s.notes);

            const card = document.createElement('div');
            card.style.cssText = `background:var(--glass-bg); border:1px solid ${subjColor}30; border-left:3px solid ${subjColor}; border-radius:12px; padding:14px; transition:transform 0.2s ease;`;
            card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
            card.onmouseleave = () => card.style.transform = '';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.75rem; background:rgba(10,132,255,0.15); color:var(--neon-blue); padding:3px 8px; border-radius:8px; font-weight:600;">
                        🎥 ${partLabel ? escapeHtml(partLabel) : 'Live Class'}
                    </span>
                    <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">${durStr}</span>
                </div>
                <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:5px;">${dateStr} at ${timeStr}</div>
                ${s.topic ? `<div style="font-size:0.88rem; color:var(--text-main); font-weight:500; margin-bottom:3px;">${escapeHtml(s.topic)}</div>` : ''}
                ${cleanNotes && cleanNotes !== s.topic ? `<div style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(cleanNotes)}</div>` : ''}
            `;
            return card;
        };

        // ── Render each subject ──────────────────────────────────────
        Object.values(bySubject).forEach(({ subj, chapters }) => {
            const subjName = subj ? subj.name : 'Unknown Subject';
            const subjColor = subj ? subj.color : '#0A84FF';
            const allSessions = Object.values(chapters).flat();
            const totalSecs = allSessions.reduce((sum, s) => sum + (s.duration || 0), 0);

            const group = document.createElement('div');
            group.style.marginBottom = '36px';

            // Subject header
            const groupHeader = document.createElement('div');
            groupHeader.style.cssText = `display:flex; align-items:center; gap:12px; margin-bottom:18px; padding-bottom:10px; border-bottom: 2px solid ${subjColor}40;`;
            groupHeader.innerHTML = `
                <div style="width:14px; height:14px; border-radius:50%; background:${subjColor}; flex-shrink:0;"></div>
                <h3 style="margin:0; color:var(--text-main);">${escapeHtml(subjName)}</h3>
                <span style="margin-left:auto; font-size:0.85rem; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:4px 10px; border-radius:20px;">
                    🎥 ${allSessions.length} class${allSessions.length > 1 ? 'es' : ''} · ${TimeUtils.formatHours(totalSecs)}
                </span>`;
            group.appendChild(groupHeader);

            // Chapter cards grid
            const chapGrid = document.createElement('div');
            chapGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;';

            Object.entries(chapters).forEach(([root, parts]) => {
                parts.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
                const chapSecs = parts.reduce((sum, s) => sum + (s.duration || 0), 0);
                const isMultiPart = parts.length > 1;

                // Chapter card (merged or single)
                const chapCard = document.createElement('div');
                chapCard.style.cssText = `background:var(--glass-bg); border:1px solid ${subjColor}30; border-radius:16px; overflow:hidden; transition:box-shadow 0.2s ease;`;

                // Chapter header
                const chapHeader = document.createElement('div');
                chapHeader.style.cssText = `padding:16px; border-left:4px solid ${subjColor}; cursor:${isMultiPart ? 'pointer' : 'default'};`;

                const topRow = document.createElement('div');
                topRow.style.cssText = 'display:flex; justify-content:space-between; align-items:flex-start; gap:8px;';

                const titleEl = document.createElement('div');
                titleEl.style.cssText = 'font-weight:700; font-size:0.97rem; color:var(--text-main); flex:1;';
                titleEl.textContent = root || 'Live Class';

                const metaEl = document.createElement('div');
                metaEl.style.cssText = 'text-align:right; flex-shrink:0;';
                metaEl.innerHTML = `
                    <div style="font-size:0.85rem; color:var(--neon-blue); font-weight:700;">${TimeUtils.formatHours(chapSecs)}</div>
                    ${isMultiPart ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${parts.length} parts</div>` : ''}
                `;

                topRow.appendChild(titleEl);
                topRow.appendChild(metaEl);
                chapHeader.appendChild(topRow);

                if (isMultiPart) {
                    // Show parts summary row (latest date + part count)
                    const latest = new Date(parts[parts.length - 1].startTime);
                    const summaryEl = document.createElement('div');
                    summaryEl.style.cssText = 'font-size:0.82rem; color:var(--text-muted); margin-top:8px; display:flex; justify-content:space-between; align-items:center;';
                    summaryEl.innerHTML = `
                        <span>Last: ${latest.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span style="color:var(--neon-blue); font-size:0.8rem; font-weight:600;" class="lc-toggle-btn">Show all parts ▾</span>
                    `;
                    chapHeader.appendChild(summaryEl);

                    // Collapsible parts container
                    const partsContainer = document.createElement('div');
                    partsContainer.style.cssText = 'display:none; padding:0 12px 12px 12px; display:none; gap:10px; flex-direction:column;';

                    parts.forEach(s => {
                        partsContainer.appendChild(makeSessionCard(s, subjColor));
                    });

                    chapCard.appendChild(chapHeader);
                    chapCard.appendChild(partsContainer);

                    // Toggle expand/collapse
                    let expanded = false;
                    const toggleBtn = summaryEl.querySelector('.lc-toggle-btn');
                    chapHeader.addEventListener('click', () => {
                        expanded = !expanded;
                        partsContainer.style.display = expanded ? 'flex' : 'none';
                        toggleBtn.textContent = expanded ? 'Hide parts ▴' : 'Show all parts ▾';
                        chapCard.style.boxShadow = expanded ? `0 0 0 1px ${subjColor}50, 0 8px 24px rgba(0,0,0,0.3)` : '';
                    });
                } else {
                    // Single part — show full detail inline
                    const s = parts[0];
                    const dateStr = new Date(s.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const timeStr = new Date(s.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    const cleanNotes = (s.notes || '').replace(/\(live class\)/gi, '').trim();

                    const detailEl = document.createElement('div');
                    detailEl.style.cssText = 'font-size:0.82rem; color:var(--text-muted); margin-top:6px;';
                    detailEl.textContent = `${dateStr} at ${timeStr}`;
                    chapHeader.appendChild(detailEl);

                    if (cleanNotes && cleanNotes !== root) {
                        const noteEl = document.createElement('div');
                        noteEl.style.cssText = 'font-size:0.82rem; color:var(--text-muted); margin-top:3px;';
                        noteEl.textContent = cleanNotes;
                        chapHeader.appendChild(noteEl);
                    }

                    chapCard.appendChild(chapHeader);
                }

                chapGrid.appendChild(chapCard);
            });

            group.appendChild(chapGrid);
            container.appendChild(group);
        });
        return;
    }

    
    let allResults = [];

    // 1. Search Sessions
    if (currentSearchFilter === 'all' || currentSearchFilter === 'sessions') {
        AppState.sessions.forEach(s => {
            // Skip live-class sessions in regular search (they have their own filter)
            if (isLiveClass(s.notes) && currentSearchFilter !== 'sessions') return;
            const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
            const subjName = subj ? subj.name : '';
            const notes = s.notes || '';
            const topic = s.topic || '';
            
            if (matchesSearch(subjName, notes, topic)) {
                allResults.push({
                    type: 'session',
                    date: new Date(s.startTime || s.date),
                    data: s,
                    subj: subj,
                    isLiveClass: isLiveClass(s.notes)
                });
            }
        });
    }

    // 2. Search Mocks
    if (currentSearchFilter === 'all' || currentSearchFilter === 'mocks') {
        AppState.mockTests.forEach(m => {
            if (matchesSearch(m.name, m.notes)) {
                allResults.push({
                    type: 'mock',
                    date: new Date(m.date),
                    data: m,
                });
            }
        });
    }

    // 3. Search Practice
    if (currentSearchFilter === 'all' || currentSearchFilter === 'practice') {
        if(Array.isArray(AppState.questionPractice)) {
            AppState.questionPractice.forEach(p => {
                if(matchesSearch(p.course, p.syllabusArea, p.topic, p.notes)) {
                    allResults.push({
                        type: 'practice',
                        date: new Date(p.date),
                        data: p,
                    });
                }
            });
        }
    }
    
    if (allResults.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No results found matching your search.</div>';
        return;
    }
    
    allResults.sort((a, b) => b.date - a.date);
    
    const renderCardRow = (title, items, iconHtml = '') => {
        if(items.length === 0) return;
        const rowWrap = document.createElement('div');
        rowWrap.style.marginBottom = '30px';
        
        const rowTitle = document.createElement('h3');
        rowTitle.style.marginBottom = '15px';
        rowTitle.style.color = 'var(--text-main)';
        rowTitle.style.borderBottom = '1px solid var(--glass-border)';
        rowTitle.style.paddingBottom = '8px';
        rowTitle.textContent = (iconHtml ? iconHtml + ' ' : '') + title;
        rowWrap.appendChild(rowTitle);
        
        const cardsWrap = document.createElement('div');
        cardsWrap.style.display = 'grid';
        cardsWrap.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
        cardsWrap.style.gap = '20px';
        
        items.forEach(res => {
            let card;
            if (res.type === 'session') {
                const s = res.data;
                const durationHrs = s.duration ? (s.duration / 3600).toFixed(2) : ((new Date(s.endTime) - new Date(s.startTime)) / 3600000).toFixed(2);
                const liveTag = res.isLiveClass ? ' 🎥' : '';
                const subtitle = `⏱️ ${durationHrs} Hours ${s.topic ? `• ${s.topic}` : ''}${liveTag}`;
                const cleanNotes = (s.notes || '').replace(/\(live class\)/gi, '').trim();
                card = createResultCard('session', res.subj ? res.subj.name : 'Unknown Subject', subtitle, res.date.toLocaleDateString(), cleanNotes, res.subj ? res.subj.color : '#0A84FF');
            } else if (res.type === 'mock') {
                const m = res.data;
                const subtitle = `Score: ${m.score} / ${m.maxScore} (${((m.score/m.maxScore)*100).toFixed(1)}%)`;
                card = createResultCard('mock', m.name, subtitle, res.date.toLocaleDateString(), m.notes || `Mock Test Log`, '#FF453A');
            } else if (res.type === 'practice') {
                const p = res.data;
                const pct = p.attempted > 0 ? Math.round((p.correct / p.attempted) * 100) : 0;
                const subtitle = `Score: ${p.correct} / ${p.attempted} (${pct}%) • ${p.confidence} Conf`;
                card = createResultCard('practice', p.topic || p.syllabusArea || 'Practice', subtitle, res.date.toLocaleDateString(), p.notes || `Course: ${p.course}`, '#FF9F0A');
            }
            if(card) cardsWrap.appendChild(card);
        });
        
        rowWrap.appendChild(cardsWrap);
        container.appendChild(rowWrap);
    };

    // Separate live class sessions from regular sessions
    const liveClassSessions = allResults.filter(r => r.type === 'session' && r.isLiveClass);
    const regularSessions = allResults.filter(r => r.type === 'session' && !r.isLiveClass);
    const practiceSessions = allResults.filter(r => r.type === 'practice');
    const mockSessions = allResults.filter(r => r.type === 'mock');

    renderCardRow('Study Sessions', regularSessions);
    renderCardRow('Live Class Sessions', liveClassSessions, '🎥');
    renderCardRow('Practice Tests', practiceSessions);
    renderCardRow('Mock Exams', mockSessions);
}


// Call initializations
document.addEventListener('DOMContentLoaded', () => {
    // Other initializations happen in the main DOMContentLoaded, so we'll just wait a bit or call these when views switch
    renderNotifications();
    setupSearch();
    
    // Attach to tab switching so they refresh
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            if (target === 'view-notifications') renderNotifications();
            if (target === 'view-search') renderSearchResults(document.getElementById('searchInput').value);
        });
    });
});

// ==========================================
// SOFTWARE UPDATE SYSTEM
// ==========================================
function renderUpdateBadge() {
    const navItem = document.getElementById('nav-software-update');
    const badge = document.getElementById('updateSidebarBadge');
    
    if (AppState.availableUpdate) {
        if (navItem) navItem.style.display = 'flex';
        if (badge) badge.style.display = 'block';
        
        const vText = document.getElementById('updateVersionText');
        const bText = document.getElementById('updateBuildText');
        const dText = document.getElementById('updateDateText');
        
        if (vText) vText.textContent = AppState.availableUpdate.version;
        if (bText) bText.textContent = AppState.availableUpdate.build;
        if (dText) dText.textContent = AppState.availableUpdate.date;
        
        const list = document.getElementById('updateFeaturesList');
        if (list) {
            list.innerHTML = AppState.availableUpdate.features.map(f => `<li style="margin-bottom: 10px;">${f}</li>`).join('');
        }
    } else {
        if (navItem) navItem.style.display = 'none';
        if (badge) badge.style.display = 'none';
    }
    
    const profileV = document.getElementById('appVersionTextProfile');
    if (profileV) profileV.textContent = AppState.currentVersion;
}

function processNewUpdate(updateInfo) {
    // Check device-local last-seen version first.
    // This survives sign-out/sign-in because it's never cloud-synced.
    const lastSeen = localStorage.getItem(STORAGE_KEYS.LAST_SEEN_VERSION);
    if (lastSeen === updateInfo.version) return; // Already installed/dismissed on this device

    if (updateInfo.version !== AppState.currentVersion &&
        (!AppState.availableUpdate || AppState.availableUpdate.version !== updateInfo.version)) {
        AppState.availableUpdate = updateInfo;
        saveData('system');
        addNotification('System Update Available', `Version ${updateInfo.version} is ready to install.`, 'info');
        renderUpdateBadge();
        
        // Let the user click it instead of forcing it
        const updateTab = document.getElementById('nav-software-update');
        if (updateTab) {
            updateTab.style.display = 'flex';
        }
    }
}

function installUpdate() {
    if (!AppState.availableUpdate) return;
    
    const newVersion = AppState.availableUpdate.version;
    AppState.currentVersion = newVersion;
    AppState.availableUpdate = null;
    saveData('system');

    // Stamp this device so sign-out/re-login never re-triggers this popup
    localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, newVersion);
    
    addNotification('Update Installed', `Successfully updated to ${newVersion}.`, 'success');
    renderUpdateBadge();
    
    const overviewTab = document.querySelector('.nav-item[data-target="view-overview"]');
    if (overviewTab) overviewTab.click();
    
    // Force cloud sync with updated systemState so cloud is also up to date
    if (typeof window.triggerCloudSync === 'function') window.triggerCloudSync();

    // If there's a service worker, tell it to skip waiting so new cache takes over
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const devBtn = document.getElementById('devTriggerUpdateBtn');
    if (devBtn) {
        devBtn.addEventListener('click', () => {
            const newVersion = 'v1.1.' + Math.floor(Math.random() * 100);
            processNewUpdate({
                version: newVersion,
                build: '2026.06.07-alpha',
                date: new Date().toLocaleDateString(),
                features: [
                    '⭐ Global Search Engine indexing Sessions, Mocks, and Subjects',
                    '🎨 Premium Glassmorphism UI enhancements',
                    '🔔 Advanced Notification Center with Color Coding',
                    '🚀 Core performance optimizations'
                ]
            });
            alert('System Update Triggered! Check the sidebar for the new Software Update tab.');
        });
    }

    const installBtn = document.getElementById('installUpdateBtn');
    if (installBtn) {
        installBtn.addEventListener('click', () => {
            installUpdate();
        });
    }
    
    const cancelBtn = document.getElementById('cancelUpdateBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            // Just go back to the dashboard, keep the badge active
            const overviewTab = document.querySelector('.nav-item[data-target="view-overview"]');
            if (overviewTab) overviewTab.click();
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed:', err));
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
                const payload = event.data.payload;
                
                // Phased Rollout Logic
                // Heavy users (10+ sessions OR active streak) get updates instantly
                // Casual users receive the update after 3 days of stability validation
                const totalSessions = AppState.sessions ? AppState.sessions.length : 0;
                const studyStreak = calculateStreaks().current;
                const isPowerUser = totalSessions > 10 || studyStreak >= 2;
                
                let requiredWaitDays = 0;
                if (!isPowerUser) {
                    requiredWaitDays = 3;
                }
                
                let diffDays = 0;
                if (payload.build) {
                    const buildParts = payload.build.split('-');
                    const datePart = buildParts[0]; // e.g. "2026.06.19"
                    const buildDate = new Date(datePart.replace(/\./g, '-'));
                    if (!isNaN(buildDate.getTime())) {
                        const now = new Date();
                        diffDays = Math.floor((now - buildDate) / (1000 * 60 * 60 * 24));
                    }
                }
                
                if (diffDays >= requiredWaitDays) {
                    processNewUpdate(payload);
                } else {
                    console.log(`[Phased Rollout] Update ${payload.version} deferred. Casual user logic active (Requires ${requiredWaitDays} days since release, currently at ${diffDays} days).`);
                }
            }
        });
        
        // Check for updates shortly after load
        setTimeout(() => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CHECK_FOR_UPDATES' });
            }
        }, 5000);
    }

    renderUpdateBadge();
});

window.deleteMock = function(mockId) {
    if (!confirm("Are you sure you want to delete this mock test record?")) return;
    AppState.mockTests = AppState.mockTests.filter(m => m.id !== mockId);
    saveData('mocks');
    renderMocksHistory();
    renderMockTotals();
    debouncedRenderAnalytics();
};

window.deletePractice = function(id) {
    if (!confirm("Are you sure you want to delete this practice session?")) return;
    AppState.questionPractice = AppState.questionPractice.filter(m => m.id !== id);
    saveData('practice');
    renderPracticeTotals();
    renderPracticeHistory();
    debouncedRenderAnalytics();
};

function renderPracticeHistory() {
    const tbody = document.getElementById('practiceTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if (!Array.isArray(AppState.questionPractice)) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No practice sessions logged</td></tr>';
        return;
    }
    
    const courseFilter = document.getElementById('practiceCourseInput')?.value;
    const areaFilter = document.getElementById('practiceAreaInput')?.value;
    const topicFilter = document.getElementById('practiceTopicInput')?.value;

    let filteredPractice = AppState.questionPractice;
    if (courseFilter && courseFilter !== '') filteredPractice = filteredPractice.filter(p => p.course === courseFilter);
    if (areaFilter && areaFilter !== '') filteredPractice = filteredPractice.filter(p => p.syllabusArea === areaFilter);
    if (topicFilter && topicFilter !== '') filteredPractice = filteredPractice.filter(p => p.topic === topicFilter);

    const sorted = [...filteredPractice].sort((a,b) => new Date(b.date) - new Date(a.date));
    if(sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No practice sessions logged for selected topic</td></tr>';
        return;
    }
    
    sorted.forEach(m => {
        const pct = Math.round((m.correct / m.attempted) * 100) || 0;
        let color = 'var(--neon-green)';
        if(pct < 50) color = 'var(--neon-red)';
        else if(pct < 75) color = 'var(--neon-gold)';
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--glass-border)';
        tr.innerHTML = `
            <td style="padding:15px 10px;">${new Date(m.date).toLocaleDateString()}</td>
            <td class="mock-name" style="padding:15px 10px;">
                <div style="font-weight:600">${m.syllabusArea || 'General'}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${m.course} ${m.topic ? '• '+m.topic : ''}</div>
            </td>
            <td style="padding:15px 10px;">
                <div style="font-weight:bold; color:${color}">${pct}%</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${m.correct}/${m.attempted}</div>
            </td>
            <td style="padding:15px 10px; text-align:right; min-width: 100px;">
                <a href="#" style="color:var(--neon-blue); margin-right:10px; font-size:0.85rem; text-decoration:none;" onclick="event.preventDefault(); editPractice('${m.id}')">Edit</a>
                <a href="#" style="color:var(--neon-red); font-size:0.85rem; text-decoration:none;" onclick="event.preventDefault(); deletePractice('${m.id}')">Delete</a>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================

// ==========================================
// MOCK TOPIC TAGS
// ==========================================

window.addMockTopicTag = function() {
    const sel = document.getElementById('mockTopicAddSelect');
    const container = document.getElementById('mockTopicTagsContainer');
    const hiddenJson = document.getElementById('mockTopicsJson');
    if (!sel || !container || !hiddenJson) return;

    const val = sel.value;
    if (!val) return;

    // Parse existing
    let topics = [];
    try { topics = JSON.parse(hiddenJson.value); } catch(e) {}
    if (topics.includes(val)) return; // no duplicates

    topics.push(val);
    hiddenJson.value = JSON.stringify(topics);

    // Render chip
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex; align-items:center; gap:5px; background:rgba(41,151,255,0.15); color:var(--neon-blue); border:1px solid rgba(41,151,255,0.35); padding:4px 10px; border-radius:20px; font-size:0.78rem; font-weight:600;';
    chip.dataset.topic = val;
    chip.innerHTML = `${escapeHtml(val)} <button type="button" onclick="removeMockTopicTag('${val.replace(/'/g,'\\\'')}')" style="background:none;border:none;color:var(--neon-red);cursor:pointer;font-size:1rem;line-height:1;padding:0;">×</button>`;
    container.appendChild(chip);
};

window.removeMockTopicTag = function(val) {
    const container = document.getElementById('mockTopicTagsContainer');
    const hiddenJson = document.getElementById('mockTopicsJson');
    if (!container || !hiddenJson) return;

    // Remove chip
    const chip = container.querySelector(`[data-topic="${CSS.escape(val)}"]`);
    if (chip) chip.remove();

    // Update JSON
    let topics = [];
    try { topics = JSON.parse(hiddenJson.value); } catch(e) {}
    topics = topics.filter(t => t !== val);
    hiddenJson.value = JSON.stringify(topics);
};


window.deleteAttendance = function(id) {
    if (!confirm("Are you sure you want to delete this session?")) return;
    const session = AppState.sessions.find(s => s.id === id);
    if (!session) return;
    const dateKey = session.startTime ? TimeUtils.getDateKey(new Date(session.startTime)) : null;
    AppState.sessions = AppState.sessions.filter(s => s.id !== id);
    saveData('sessions');
    debouncedRenderOverview();
    debouncedRenderAttendance();
    debouncedRenderAnalytics();
    if (dateKey) renderDayReport(dateKey);
};

window.editAttendance = function(id) {
    const session = AppState.sessions.find(s => s.id === id);
    if (!session) return;
    
    document.getElementById('editAttendanceId').value = id;
    let dateStr = '';
    if (session.startTime) dateStr = TimeUtils.getDateKey(new Date(session.startTime));
    document.getElementById('editAttendanceDate').value = dateStr;
    
    const subjectSelect = document.getElementById('editAttendanceSubject');
    subjectSelect.innerHTML = '';
    AppState.subjects.forEach(subj => {
        const opt = document.createElement('option');
        opt.value = subj.id;
        opt.textContent = subj.name;
        subjectSelect.appendChild(opt);
    });
    document.getElementById('editAttendanceSubject').value = session.subjectId;
    
    document.getElementById('editAttendanceNotes').value = session.notes || '';
    
    const durSecs = session.duration || 0;
    const h = Math.floor(durSecs / 3600);
    const m = Math.floor((durSecs % 3600) / 60);
    
    document.getElementById('editAttendanceHours').value = h;
    document.getElementById('editAttendanceMinutes').value = m;

    // Pre-fill start/end time from existing session data
    const startDate = new Date(session.startTime);
    const endDate   = new Date(session.endTime);
    const pad = n => String(n).padStart(2, '0');

    // Cache elements once for this modal open
    const editStartEl   = document.getElementById('editStartTimeInput');
    const editEndEl     = document.getElementById('editEndTimeInput');
    const editPreviewEl = document.getElementById('editTimeDurationPreview');
    const editHoursEl   = document.getElementById('editAttendanceHours');
    const editMinsEl    = document.getElementById('editAttendanceMinutes');

    editStartEl.value = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
    editEndEl.value   = endDate && !isNaN(endDate) ? `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}` : '';

    // Instant preview calculation (no setTimeout, no debounce needed — it's trivial math)
    const updateEditPreview = () => {
        const startVal = editStartEl.value;
        const endVal   = editEndEl.value;
        if (startVal && endVal) {
            const [sh, sm] = startVal.split(':').map(Number);
            const [eh, em] = endVal.split(':').map(Number);
            let totalMins = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMins <= 0) totalMins += 24 * 60; // overnight
            const calcH = Math.floor(totalMins / 60);
            const calcM = totalMins % 60;
            editPreviewEl.style.display = 'block';
            editPreviewEl.textContent = `⏱ ${calcH}h ${calcM}m calculated`;
            editHoursEl.value = calcH;
            editMinsEl.value  = calcM;
        } else {
            editPreviewEl.style.display = 'none';
        }
    };

    // Clear any previous handlers (prevents stacking on repeated modal opens)
    editStartEl.oninput  = updateEditPreview;
    editStartEl.onchange = updateEditPreview;
    editEndEl.oninput    = updateEditPreview;
    editEndEl.onchange   = updateEditPreview;

    // Show preview immediately since times are already pre-filled
    updateEditPreview();

    document.getElementById('editAttendanceModal').classList.add('active');

};

window.saveEditAttendance = function() {
    const id = document.getElementById('editAttendanceId').value;
    const date = document.getElementById('editAttendanceDate').value;
    const subj = document.getElementById('editAttendanceSubject').value;
    const notes = document.getElementById('editAttendanceNotes').value;
    const h = parseInt(document.getElementById('editAttendanceHours').value) || 0;
    const m = parseInt(document.getElementById('editAttendanceMinutes').value) || 0;
    
    const session = AppState.sessions.find(s => s.id === id);
    if (!session) return;
    if (!date || !subj) return alert("Date and subject are required.");
    
    const durSecs = (h * 3600) + (m * 60);
    if (durSecs <= 0) return alert("Duration must be > 0");
    
    // Use start/end time inputs if provided
    const startTimeVal = document.getElementById('editStartTimeInput').value;
    const endTimeVal = document.getElementById('editEndTimeInput').value;
    let sessionStart, sessionEnd;

    if (startTimeVal) {
        const [sh, sm] = startTimeVal.split(':').map(Number);
        sessionStart = new Date(date + 'T00:00:00');
        sessionStart.setHours(sh, sm, 0, 0);
    } else {
        const now = new Date();
        sessionStart = new Date(date + 'T00:00:00');
        sessionStart.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    }

    if (endTimeVal) {
        const [eh, em] = endTimeVal.split(':').map(Number);
        sessionEnd = new Date(date + 'T00:00:00');
        sessionEnd.setHours(eh, em, 0, 0);
        if (sessionEnd <= sessionStart) sessionEnd.setDate(sessionEnd.getDate() + 1);
    } else {
        sessionEnd = new Date(sessionStart.getTime() + durSecs * 1000);
    }

    session.startTime = sessionStart.toISOString();
    session.endTime = sessionEnd.toISOString();
    session.subjectId = subj;
    session.notes = notes;
    session.duration = durSecs;
    
    saveData('sessions');
    document.getElementById('editAttendanceModal').classList.remove('active');
    debouncedRenderOverview();
    debouncedRenderAttendance();
    debouncedRenderAnalytics();
    renderDayReport(date);
};

window.editPractice = function(id) {
    const session = AppState.questionPractice.find(s => s.id === id);
    if (!session) return;
    
    document.getElementById('editPracticeId').value = id;
    document.getElementById('editPracticeDate').value = (session.date || '').split('T')[0];
    document.getElementById('editPracticeAttempted').value = session.attempted;
    document.getElementById('editPracticeCorrect').value = session.correct;
    document.getElementById('editPracticeNotes').value = session.notes || '';
    
    document.getElementById('editPracticeModal').classList.add('active');
};

window.saveEditPractice = function() {
    const id = document.getElementById('editPracticeId').value;
    const date = document.getElementById('editPracticeDate').value;
    const attempted = parseInt(document.getElementById('editPracticeAttempted').value) || 0;
    const correct = parseInt(document.getElementById('editPracticeCorrect').value) || 0;
    const notes = document.getElementById('editPracticeNotes').value || '';
    
    if (!date || attempted < 1) return alert("Valid date and attempted questions > 0 are required.");
    if (correct > attempted) return alert("Correct answers cannot exceed attempted.");
    
    const session = AppState.questionPractice.find(s => s.id === id);
    if (!session) return;
    
    session.date = date;
    session.attempted = attempted;
    session.correct = correct;
    session.notes = notes;
    
    saveData('practice');
    document.getElementById('editPracticeModal').classList.remove('active');
    renderPracticeTotals();
    renderPracticeHistory();
    debouncedRenderAnalytics();
};

window.editMock = function(id) {
    const session = AppState.mockTests.find(s => s.id === id);
    if (!session) return;
    
    document.getElementById('editMockId').value = id;
    document.getElementById('editMockDate').value = (session.date || '').split('T')[0];
    document.getElementById('editMockScore').value = session.score;
    document.getElementById('editMockMaxScore').value = session.maxScore;
    document.getElementById('editMockNotes').value = session.notes || '';
    
    document.getElementById('editMockModal').classList.add('active');
};

window.saveEditMock = function() {
    const id = document.getElementById('editMockId').value;
    const date = document.getElementById('editMockDate').value;
    const score = parseFloat(document.getElementById('editMockScore').value) || 0;
    const maxScore = parseFloat(document.getElementById('editMockMaxScore').value) || 0;
    const notes = document.getElementById('editMockNotes').value || '';
    
    if (!date || maxScore < 1) return alert("Valid date and max score > 0 are required.");
    if (score > maxScore) return alert("Score cannot exceed max score.");
    
    const session = AppState.mockTests.find(s => s.id === id);
    if (!session) return;
    
    session.date = date;
    session.score = score;
    session.maxScore = maxScore;
    session.notes = notes;
    
    saveData('mocks');
    document.getElementById('editMockModal').classList.remove('active');
    renderMocksHistory();
    renderMockTotals();
    debouncedRenderAnalytics();
};

// ==========================================
// FOCUS MODE LOGIC
// ==========================================
let focusTimerInterval = null;
let focusMode = 'pomodoro'; // pomodoro, shortBreak, longBreak, stopwatch
let focusState = 'stopped'; // stopped, running, paused
let focusSecondsRemaining = 25 * 60;
let focusStopwatchSeconds = 0;
let focusLastTick = 0;

function initFocusMode() {
    const startBtn = document.getElementById('focusStartBtn');
    const pauseBtn = document.getElementById('focusPauseBtn');
    const resetBtn = document.getElementById('focusResetBtn');
    const display = document.getElementById('focusTimerDisplay');
    const durationInput = document.getElementById('focusDurationInput');
    const logBtn = document.getElementById('focusLogSessionBtn');
    const logContainer = document.getElementById('focusLogContainer');
    const logMsg = document.getElementById('focusLogMsg');

    const modePomodoroBtn = document.getElementById('modePomodoroBtn');
    const modeShortBreakBtn = document.getElementById('modeShortBreakBtn');
    const modeLongBreakBtn = document.getElementById('modeLongBreakBtn');
    const modeStopwatchBtn = document.getElementById('modeStopwatchBtn');
    
    function formatTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        if (h > 0) return `${h}:${m}:${s}`;
        return `${m}:${s}`;
    }

    function updateDisplay() {
        if (focusMode === 'stopwatch') {
            display.textContent = formatTime(focusStopwatchSeconds);
        } else {
            display.textContent = formatTime(focusSecondsRemaining);
        }
    }

    function setMode(mode) {
        if (focusState !== 'stopped') resetTimer();
        focusMode = mode;
        
        [modePomodoroBtn, modeShortBreakBtn, modeLongBreakBtn, modeStopwatchBtn].forEach(b => b.classList.remove('active'));
        
        if (mode === 'pomodoro') {
            modePomodoroBtn.classList.add('active');
            document.getElementById('pomodoroConfigContainer').style.display = 'inline-block';
            let mins = parseInt(durationInput.value) || 25;
            focusSecondsRemaining = mins * 60;
        } else {
            document.getElementById('pomodoroConfigContainer').style.display = 'none';
        }
        
        if (mode === 'shortBreak') {
            modeShortBreakBtn.classList.add('active');
            focusSecondsRemaining = 5 * 60;
        } else if (mode === 'longBreak') {
            modeLongBreakBtn.classList.add('active');
            focusSecondsRemaining = 15 * 60;
        } else if (mode === 'stopwatch') {
            modeStopwatchBtn.classList.add('active');
            focusStopwatchSeconds = 0;
        }
        
        logContainer.style.display = 'none';
        updateDisplay();
    }

    durationInput.addEventListener('change', () => {
        if (focusMode === 'pomodoro' && focusState === 'stopped') {
            let mins = parseInt(durationInput.value) || 25;
            focusSecondsRemaining = mins * 60;
            updateDisplay();
        }
    });

    modePomodoroBtn.addEventListener('click', () => setMode('pomodoro'));
    modeShortBreakBtn.addEventListener('click', () => setMode('shortBreak'));
    modeLongBreakBtn.addEventListener('click', () => setMode('longBreak'));
    modeStopwatchBtn.addEventListener('click', () => setMode('stopwatch'));

    function startTimer() {
        if (focusState === 'running') return;
        if (focusMode !== 'stopwatch' && focusSecondsRemaining <= 0) return;
        
        focusState = 'running';
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        logContainer.style.display = 'none';
        
        focusLastTick = Date.now();
        focusTimerInterval = setInterval(() => {
            const now = Date.now();
            const diff = Math.floor((now - focusLastTick) / 1000);
            
            if (diff > 0) {
                focusLastTick += diff * 1000;
                
                if (focusMode === 'stopwatch') {
                    focusStopwatchSeconds += diff;
                    updateDisplay();
                } else {
                    focusSecondsRemaining -= diff;
                    if (focusSecondsRemaining < 0) focusSecondsRemaining = 0;
                    updateDisplay();
                    
                    if (focusSecondsRemaining <= 0) {
                        clearInterval(focusTimerInterval);
                        focusState = 'stopped';
                        startBtn.style.display = 'inline-block';
                        pauseBtn.style.display = 'none';
                        showLogOptions();
                    }
                }
            }
        }, 500); // 500ms for fast responsiveness, logic handles catch-up
    }

    function pauseTimer() {
        if (focusState !== 'running') return;
        clearInterval(focusTimerInterval);
        focusState = 'paused';
        startBtn.style.display = 'inline-block';
        pauseBtn.style.display = 'none';
    }

    function resetTimer() {
        clearInterval(focusTimerInterval);
        focusState = 'stopped';
        startBtn.style.display = 'inline-block';
        pauseBtn.style.display = 'none';
        
        if (focusMode === 'pomodoro') {
            let mins = parseInt(durationInput.value) || 25;
            focusSecondsRemaining = mins * 60;
        } else if (focusMode === 'shortBreak') {
            focusSecondsRemaining = 5 * 60;
        } else if (focusMode === 'longBreak') {
            focusSecondsRemaining = 15 * 60;
        } else if (focusMode === 'stopwatch') {
            if (focusStopwatchSeconds > 60) {
                showLogOptions(); // Ask to log if stopwatch ran > 1 min
            }
            focusStopwatchSeconds = 0;
        }
        updateDisplay();
        logContainer.style.display = 'none';
    }

    function showLogOptions() {
        if (focusMode === 'shortBreak' || focusMode === 'longBreak') return; 
        
        let totalSecs = focusMode === 'stopwatch' ? focusStopwatchSeconds : (parseInt(durationInput.value) || 25) * 60;
        let mins = Math.floor(totalSecs / 60);
        
        if (mins < 1) return; 
        
        logContainer.style.display = 'block';
        logMsg.textContent = `🎯 Focus Session Complete! (${mins} mins)`;
        
        logBtn.onclick = () => {
            document.getElementById('logDateInput').value = TimeUtils.getDateKey(new Date());
            document.getElementById('logHoursInput').value = Math.floor(mins / 60);
            document.getElementById('logMinutesInput').value = mins % 60;
            document.getElementById('logNotesInput').value = focusMode === 'pomodoro' ? 'Pomodoro Session 🍅' : 'Focus Session 🎯';
            
            // Auto calculate end time = now, start time = now - duration
            const now = new Date();
            const start = new Date(now.getTime() - (mins * 60000));
            const pad = n => String(n).padStart(2, '0');
            
            document.getElementById('logStartTimeInput').value = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
            document.getElementById('logEndTimeInput').value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
            
            if (window._focusContextSubjectId) {
                document.getElementById('logSubjectInput').value = window._focusContextSubjectId;
                window._focusContextSubjectId = null; // Clear it so it doesn't leak
                const display = document.getElementById('focusContextDisplay');
                if (display) display.style.display = 'none';
            }
            
            window._isLoggingFocusSession = true;
            document.getElementById('logSessionModal').classList.add('active');
            
            // Dispatch input event to trigger duration preview recalculation
            document.getElementById('logStartTimeInput').dispatchEvent(new Event('input'));
        };
    }

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    setMode('pomodoro');
}

// ==========================================
// SCHEDULE LOGIC
// ==========================================
let currentScheduleTab = 'today';

function initSchedule() {
    document.getElementById('tabScheduleToday').addEventListener('click', () => setScheduleTab('today'));
    document.getElementById('tabScheduleUpcoming').addEventListener('click', () => setScheduleTab('upcoming'));
    document.getElementById('tabSchedulePast').addEventListener('click', () => setScheduleTab('past'));
    
    document.getElementById('addScheduleBtn').addEventListener('click', () => openScheduleModal());
    document.getElementById('saveScheduleBtn').addEventListener('click', saveSchedulePlan);
    
    document.getElementById('closeScheduleModalBtn').addEventListener('click', () => {
        document.getElementById('scheduleModal').classList.remove('active');
    });

    document.getElementById('scheduleTypeInput').addEventListener('change', updateScheduleModalFields);
    
    document.getElementById('scheduleCourseInput').addEventListener('change', (e) => {
        populateScheduleSubjects(e.target.value);
        updateScheduleExamAlert();
    });

    document.getElementById('scheduleSubjectInput').addEventListener('change', (e) => {
        populateScheduleTopics(e.target.value);
    });

    document.getElementById('scheduleTopicDropdown').addEventListener('change', (e) => {
        // ... (removed custom topic logic)
    });
}

function updateScheduleModalFields() {
    const type = document.getElementById('scheduleTypeInput').value;
    const isExamReg = type === 'exam_register';
    
    const standardFields = document.getElementById('scheduleStandardFields');
    const examRegFields = document.getElementById('scheduleExamRegFields');
    const timeFields = document.getElementById('scheduleTimeFields');
    const dateLabel = document.querySelector('#scheduleDateInput')?.previousElementSibling;

    if (standardFields) standardFields.style.display = isExamReg ? 'none' : 'block';
    if (examRegFields) examRegFields.style.display = isExamReg ? 'block' : 'none';
    if (timeFields) timeFields.style.display = isExamReg ? 'none' : 'flex';
    
    // For exam_register, the Date field label changes to "Registration Planning Date"
    if (dateLabel && dateLabel.tagName === 'LABEL') {
        dateLabel.textContent = isExamReg ? 'Registration Planning Date' : 'Date';
    }
    
    if (!isExamReg) {
        updateScheduleExamAlert();
    }
}

function updateScheduleExamAlert() {
    const type = document.getElementById('scheduleTypeInput').value;
    const alertEl = document.getElementById('scheduleExamAlert');
    if (!alertEl) return;
    
    if (type !== 'pending_topic') {
        alertEl.style.display = 'none';
        return;
    }
    
    const course = document.getElementById('scheduleCourseInput').value;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    let nextExam = null;
    let minDiff = Infinity;
    
    EXAMS.forEach(exam => {
        if (course === 'CSEB' && !exam.category.includes('CAT')) return;
        if (course === 'ACCA' && !exam.category.includes('ACCA')) return;
        if (exam.postponed || !exam.date) return; // Skip postponed exams
        
        const examDate = new Date(exam.date);
        const diffTime = examDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays < minDiff) {
            minDiff = diffDays;
            nextExam = exam;
        }
    });
    
    if (nextExam) {
        alertEl.style.display = 'block';
        alertEl.innerHTML = `&#128680; <strong>Next Exam:</strong> ${nextExam.category.split('·')[0].trim()} is in <strong>${minDiff} day${minDiff !== 1 ? 's' : ''}!</strong>`;
    } else {
        alertEl.style.display = 'none';
    }
}

function addCustomTopicToSyllabus(subjId, topicName) {
    const subj = AppState.subjects.find(s => s.id === subjId);
    if (!subj) return;
    
    const currentViewCourse = subj.course || 'CSEB';
    const cleanName = subj.name.replace(/\(cseb\)|\(acca\)/gi, '').trim().toLowerCase();
    
    if (currentViewCourse === 'CSEB' && AppState.csebSyllabus) {
        const key = Object.keys(AppState.csebSyllabus).find(k => {
            const cleanK = k.toLowerCase();
            return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
        });
        if (key) {
            AppState.csebSyllabus[key].push({ name: topicName, completed: false, difficulty: 'Medium' });
        } else {
            AppState.csebSyllabus[subj.name] = [{ name: topicName, completed: false, difficulty: 'Medium' }];
        }
        saveData('csebSyllabus');
    } else if (currentViewCourse === 'ACCA' && AppState.accaTopics) {
        const key = Object.keys(AppState.accaTopics).find(k => {
            const cleanK = k.toLowerCase();
            return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
        });
        if (key) {
            AppState.accaTopics[key].push({ name: topicName, completed: false, difficulty: 'Medium' });
        } else {
            AppState.accaTopics[subj.name] = [{ name: topicName, completed: false, difficulty: 'Medium' }];
        }
        saveData('accaTopics');
    }
}

function populateScheduleSubjects(course) {
    const select = document.getElementById('scheduleSubjectInput');
    select.innerHTML = '';
    const filtered = AppState.subjects.filter(s => s.course === course || (!s.course && course === 'CSEB'));
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        select.appendChild(opt);
    });
    if(filtered.length > 0) {
        populateScheduleTopics(filtered[0].id);
    } else {
        document.getElementById('scheduleTopicDropdown').innerHTML = '<option value="">-- Select a Topic (Optional) --</option>';
    }
}

function populateScheduleTopics(subjId) {
    const topicDropdown = document.getElementById('scheduleTopicDropdown');
    topicDropdown.innerHTML = '<option value="">-- Select a Topic (Optional) --</option>';
    
    const subj = AppState.subjects.find(s => s.id === subjId);
    if (!subj) return;
    
    let syllabusTopics = null;
    const currentViewCourse = subj.course || 'CSEB';
    const cleanName = subj.name.replace(/\(cseb\)|\(acca\)/gi, '').trim().toLowerCase();
    
    if (currentViewCourse === 'CSEB' && AppState.csebSyllabus) {
        const key = Object.keys(AppState.csebSyllabus).find(k => {
            const cleanK = k.toLowerCase();
            return cleanName === cleanK || cleanName.includes(cleanK) || cleanK.includes(cleanName);
        });
        if (key) syllabusTopics = AppState.csebSyllabus[key];
    } else if (currentViewCourse === 'ACCA' && AppState.accaTopics) {
        syllabusTopics = [].concat(...Object.values(AppState.accaTopics));
    }
    
    if (syllabusTopics) {
        syllabusTopics.forEach(t => {
            const name = t.name || t.topic || t;
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            topicDropdown.appendChild(opt);
        });
    }
}

function setScheduleTab(tab) {
    currentScheduleTab = tab;
    ['tabScheduleToday', 'tabScheduleUpcoming', 'tabSchedulePast'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id.toLowerCase().includes(tab)) {
            el.style.background = 'var(--glass-bg)';
            el.style.border = '1px solid var(--glass-border)';
            el.style.color = 'var(--text-main)';
            el.style.boxShadow = 'none';
        } else {
            el.style.background = 'transparent';
            el.style.border = '1px solid transparent';
            el.style.color = 'var(--text-muted)';
            el.style.boxShadow = 'none';
        }
    });
    renderScheduleList();
}

window.openScheduleModal = function(id = null) {
    const modal = document.getElementById('scheduleModal');
    if (id) {
        const item = AppState.schedule.find(s => s.id === id);
        if (!item) return;
        document.getElementById('scheduleModalTitle').textContent = 'Edit Schedule Plan';
        document.getElementById('scheduleIdInput').value = item.id;
        document.getElementById('scheduleTypeInput').value = item.type;
        document.getElementById('scheduleCourseInput').value = item.course || 'CSEB';
        populateScheduleSubjects(item.course || 'CSEB');
        if (item.subjectId) {
            document.getElementById('scheduleSubjectInput').value = item.subjectId;
            populateScheduleTopics(item.subjectId);
            if (item.topic) document.getElementById('scheduleTopicDropdown').value = item.topic;
        }
        document.getElementById('scheduleTitleInput').value = item.title || '';
        document.getElementById('scheduleDateInput').value = item.date;
        document.getElementById('scheduleStartTimeInput').value = item.startTime || '10:00';
        document.getElementById('scheduleEndTimeInput').value = item.endTime || '11:00';
        // Populate exam_register fields
        const erCourse = document.getElementById('scheduleExamRegCourse');
        const erTitle = document.getElementById('scheduleExamRegTitle');
        const erNotif = document.getElementById('scheduleExamNotifNo');
        const erReg = document.getElementById('scheduleExamRegNo');
        const erDate = document.getElementById('scheduleExamDate');
        const erNotes = document.getElementById('scheduleExamNotes');
        if (erCourse) erCourse.value = item.course || 'CSEB';
        if (erTitle) erTitle.value = item.title || '';
        if (erNotif) erNotif.value = item.notifNo || '';
        if (erReg) erReg.value = item.regNo || '';
        if (erDate) erDate.value = item.examDate || '';
        if (erNotes) erNotes.value = item.notes || '';
    } else {
        document.getElementById('scheduleModalTitle').textContent = 'Add Schedule Plan';
        document.getElementById('scheduleIdInput').value = '';
        document.getElementById('scheduleTypeInput').value = 'study';
        document.getElementById('scheduleCourseInput').value = 'CSEB';
        populateScheduleSubjects('CSEB');
        document.getElementById('scheduleTitleInput').value = '';
        const today = TimeUtils.getDateKey(new Date());
        document.getElementById('scheduleDateInput').value = today;
        document.getElementById('scheduleStartTimeInput').value = '10:00';
        document.getElementById('scheduleEndTimeInput').value = '11:00';
        // Reset exam reg fields
        ['scheduleExamRegTitle','scheduleExamNotifNo','scheduleExamRegNo','scheduleExamNotes'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        const examDateEl = document.getElementById('scheduleExamDate');
        if (examDateEl) examDateEl.value = '';
    }
    updateScheduleModalFields();
    modal.classList.add('active');
};

function saveSchedulePlan() {
    const id = document.getElementById('scheduleIdInput').value;
    const type = document.getElementById('scheduleTypeInput').value;
    const date = document.getElementById('scheduleDateInput').value;
    
    if (!date) return alert('Please select a date.');
    
    if (type === 'exam_register') {
        const course = document.getElementById('scheduleExamRegCourse').value;
        const title = document.getElementById('scheduleExamRegTitle').value.trim();
        const notifNo = document.getElementById('scheduleExamNotifNo').value.trim();
        const regNo = document.getElementById('scheduleExamRegNo').value.trim();
        const examDate = document.getElementById('scheduleExamDate').value;
        const notes = document.getElementById('scheduleExamNotes').value.trim();
        
        if (!title) return alert('Please enter an Exam Name / Title.');
        
        const payload = {
            id: id || generateId(),
            type,
            course,
            subjectId: null,
            topic: null,
            title,
            notifNo,
            regNo,
            examDate,
            notes,
            date,
            startTime: '00:00',
            endTime: '00:00',
            status: 'pending'
        };
        
        if (id) {
            const idx = AppState.schedule.findIndex(s => s.id === id);
            if (idx !== -1) AppState.schedule[idx] = { ...AppState.schedule[idx], ...payload };
        } else {
            AppState.schedule.push(payload);
        }
        saveData('schedule');
        renderScheduleList();
        document.getElementById('scheduleModal').classList.remove('active');
        addNotification('Exam Registration Saved', `${title} (${course}) has been added to your planner.`, 'success');
        return;
    }
    
    // Standard types
    const course = document.getElementById('scheduleCourseInput').value;
    const subjectId = document.getElementById('scheduleSubjectInput').value;
    const topic = document.getElementById('scheduleTopicDropdown').value;
    const title = document.getElementById('scheduleTitleInput').value.trim();
    const startTime = document.getElementById('scheduleStartTimeInput').value;
    const endTime = document.getElementById('scheduleEndTimeInput').value;
    
    if (!subjectId || !date || !startTime || !endTime) {
        return alert('Please fill in all required fields (Subject, Date, Times)');
    }
    
    if (id) {
        const item = AppState.schedule.find(s => s.id === id);
        if (item) {
            item.type = type;
            item.course = course;
            item.subjectId = subjectId;
            item.topic = topic;
            item.title = title;
            item.date = date;
            item.startTime = startTime;
            item.endTime = endTime;
            // Reset status so rescheduled/edited missed items become pending again
            if (item.status === 'missed') item.status = 'pending';
        }
    } else {
        AppState.schedule.push({
            id: generateId(),
            type,
            course,
            subjectId,
            topic,
            title,
            date,
            startTime,
            endTime,
            status: 'pending' // pending, completed
        });
    }
    
    saveData('schedule');
    document.getElementById('scheduleModal').classList.remove('active');
    renderScheduleList();
    debouncedRenderOverview();
}

window.deleteScheduleItem = function(id) {
    if (!confirm('Are you sure you want to delete this scheduled plan?')) return;
    const item = AppState.schedule.find(s => s.id === id);
    AppState.schedule = AppState.schedule.filter(s => s.id !== id);
    saveData('schedule');
    renderScheduleList();
    debouncedRenderOverview();
    if (item) renderDayReport(item.date);
};

window.missScheduleItem = function(id) {
    const item = AppState.schedule.find(s => s.id === id);
    if (!item) return;
    item.status = 'missed';
    saveData('schedule');
    renderScheduleList();
    debouncedRenderOverview();
    renderDayReport(item.date);
};

window.moveScheduleItemToTomorrow = function(id) {
    const item = AppState.schedule.find(s => s.id === id);
    if (!item) return;
    const d = new Date(item.date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    item.date = TimeUtils.getDateKey(d);
    item.status = 'pending';
    saveData('schedule');
    renderScheduleList();
    debouncedRenderOverview();
    addNotification('Moved to Tomorrow', `"${item.title || 'Schedule item'}" has been rescheduled to tomorrow.`, 'info');
};

window.completeScheduleItem = function(id) {
    const item = AppState.schedule.find(s => s.id === id);
    if (!item) return;

    // exam_register items can't be logged as sessions — just mark done
    if (item.type === 'exam_register') {
        item.status = 'completed';
        saveData('schedule');
        renderScheduleList();
        debouncedRenderOverview();
        addNotification('Marked Complete', `"${item.title || 'Exam Registration'}" marked as done.`, 'success');
        return;
    }

    // Auto-fill logSessionModal instead of silently logging
    document.getElementById('logDateInput').value = item.date;
    
    const start = new Date(`${item.date}T${item.startTime || '00:00'}:00`);
    let end = new Date(`${item.date}T${item.endTime || '01:00'}:00`);
    if (end < start) end.setDate(end.getDate() + 1); // overnight
    const diffMins = Math.round((end - start) / 60000);
    
    document.getElementById('logHoursInput').value = Math.floor(diffMins / 60);
    document.getElementById('logMinutesInput').value = diffMins % 60;
    
    document.getElementById('logStartTimeInput').value = item.startTime || '00:00';
    document.getElementById('logEndTimeInput').value = item.endTime || '01:00';
    
    const courseInput = document.getElementById('logCourseInput');
    courseInput.value = item.course || 'CSEB';
    populateLogSubjects(item.course || 'CSEB');
    document.getElementById('logSubjectInput').value = item.subjectId;
    populateLogTopics(item.subjectId);
    
    if (item.topic) document.getElementById('logTopicDropdown').value = item.topic;
    document.getElementById('logNotesInput').value = item.title || '';
    
    window._completingScheduleId = id;
    document.getElementById('logSessionModal').classList.add('active');
    
    // Dispatch input event to trigger preview
    document.getElementById('logStartTimeInput').dispatchEvent(new Event('input'));
};

function renderScheduleList() {
    const container = document.getElementById('scheduleListContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const todayStr = TimeUtils.getDateKey(new Date());
    
    let filtered = AppState.schedule.filter(s => {
        if (currentScheduleTab === 'today') return s.date === todayStr;
        if (currentScheduleTab === 'upcoming') return s.date > todayStr;
        if (currentScheduleTab === 'past') return s.date < todayStr;
        return false;
    });
    
    // Sort by date, then by time (guard for null startTime on exam_register)
    filtered.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });
    
    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 40px 20px; color: var(--text-muted);">No plans scheduled for ${currentScheduleTab}.</div>`;
        return;
    }
    
    filtered.forEach(item => {
        const isClass = item.type === 'class';
        const isPending = item.type === 'pending_topic';
        const isMock = item.type === 'mock_test';
        let color = 'var(--neon-blue)';
        let icon = '&#128218;';
        if (isClass) { color = 'var(--neon-purple)'; icon = '&#127979;'; }
        else if (isPending) { color = 'var(--neon-gold)'; icon = '&#128203;'; }
        else if (isMock) { color = 'var(--neon-red)'; icon = '&#127919;'; }
        else if (item.type === 'exam_register') { color = 'var(--neon-green)'; icon = '&#128196;'; }
        
        const card = document.createElement('div');
        card.style.background = 'var(--glass-bg)';
        card.style.border = '1px solid var(--glass-border)';
        card.style.borderLeft = `3px solid ${item.status === 'completed' ? 'var(--glass-border)' : color}`;
        card.style.borderRadius = '12px';
        card.style.padding = '15px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '10px';
        if (item.status === 'completed') card.style.opacity = '0.6';
        
        const formatTimeStr = (t) => {
            let [h, m] = (t || '00:00').split(':').map(Number);
            let ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return `${h}:${m.toString().padStart(2,'0')} ${ampm}`;
        };
        const dateDisp = currentScheduleTab !== 'today' ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">${new Date(item.date + 'T12:00:00').toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'})}</div>` : '';
        
        const isExamReg = item.type === 'exam_register';
        
        // Build card content
        let cardBody = '';

        
        if (isExamReg) {
            const examDateStr = item.examDate ? new Date(item.examDate).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric', year:'numeric'}) : 'TBD';
            const metaBits = [
                item.notifNo ? `<span style="background:rgba(48,209,88,0.1); color:var(--neon-green); border-radius:4px; padding:2px 6px; font-size:0.72rem;">Notif: ${escapeHtml(item.notifNo)}</span>` : '',
                item.regNo ? `<span style="background:rgba(41,151,255,0.1); color:var(--neon-blue); border-radius:4px; padding:2px 6px; font-size:0.72rem;">Reg: ${escapeHtml(item.regNo)}</span>` : ''
            ].filter(Boolean).join(' ');
            cardBody = `
                ${dateDisp}
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                        <div style="width:30px; height:30px; flex-shrink:0; border-radius:50%; background:var(--glass-bg); display:flex; align-items:center; justify-content:center; font-size:1.1rem;">${icon}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.65rem; color:${color}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">${escapeHtml(item.course)} &bull; Exam Registration</div>
                            <div style="font-weight:600; font-size:1.05rem;">${escapeHtml(item.title)}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">&#128197; Deadline: <b style="color:var(--text-main);">${examDateStr}</b></div>
                            ${metaBits ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:5px;">${metaBits}</div>` : ''}
                            ${item.notes ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(item.notes)}</div>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:5px; flex-shrink:0;">
                        <button onclick="openScheduleModal('${item.id}')" style="background:transparent; color:var(--neon-blue); border:none; border-radius:6px; padding:6px; cursor:pointer;" title="Edit">&#9998;</button>
                        <button onclick="deleteScheduleItem('${item.id}')" style="background:transparent; color:var(--neon-red); border:none; border-radius:6px; padding:6px; cursor:pointer;" title="Delete">&times;</button>
                    </div>
                </div>
            `;
        } else {
            const subj = AppState.subjects.find(s => s.id === item.subjectId);
            const subjName = subj ? subj.name : 'Unknown Subject';
            const displayTitle = [subjName, item.topic, item.title].filter(Boolean).join(' - ');
            cardBody = `
                ${dateDisp}
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 10px;">
                    <div style="display:flex; align-items:center; gap:10px; flex: 1; min-width: 0;">
                        <div style="width:30px; height:30px; flex-shrink: 0; border-radius:50%; background:var(--glass-bg); color:var(--text-main); display:flex; align-items:center; justify-content:center; font-size:1.1rem; box-shadow:0 2px 5px rgba(0,0,0,0.2);">${icon}</div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight:600; font-size:1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${item.status==='completed' ? 'text-decoration:line-through; color:var(--text-muted);' : ''}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatTimeStr(item.startTime)} - ${formatTimeStr(item.endTime)}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:5px; flex-shrink: 0;">
                        ${item.status !== 'completed' ? `
                            <button onclick="completeScheduleItem('${item.id}')" style="background:rgba(48,209,88,0.15); color:var(--neon-green); border:none; border-radius:6px; padding:6px 10px; cursor:pointer;" title="Complete & Log">&#10003;</button>
                            ${currentScheduleTab === 'today' ? `<button onclick="moveScheduleItemToTomorrow('${item.id}')" style="background:rgba(255,159,10,0.15); color:var(--neon-gold); border:none; border-radius:6px; padding:6px 8px; cursor:pointer; font-size:0.75rem;" title="Move to Tomorrow">&#8594;Tmrw</button>` : ''}
                        ` : `<span style="color:var(--neon-green); font-size:0.8rem; border:1px solid var(--neon-green); border-radius:4px; padding:2px 6px;">Done</span>`}
                        <button onclick="openScheduleModal('${item.id}')" style="background:transparent; color:var(--neon-blue); border:none; border-radius:6px; padding:6px; cursor:pointer;" title="Edit">&#9998;</button>
                        <button onclick="deleteScheduleItem('${item.id}')" style="background:transparent; color:var(--neon-red); border:none; border-radius:6px; padding:6px; cursor:pointer;" title="Delete">&times;</button>
                    </div>
                </div>
            `;
        }
        
        card.innerHTML = cardBody;
        container.appendChild(card);
    });
}

function renderOverviewScheduleWidget() {
    const container = document.getElementById('overviewScheduleContainer');
    if (!container) return;
    
    const todayStr = TimeUtils.getDateKey(new Date());
    let todayItems = AppState.schedule.filter(s => s.date === todayStr && s.status !== 'missed');
    
    if (todayItems.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.9rem;">No plans scheduled for today.</div>`;
        return;
    }
    
    // Sort by time (guard for null startTime on exam_register items)
    todayItems.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
    
    // Take up to 3 items
    const displayItems = todayItems.slice(0, 3);
    
    const formatTimeStr = (t) => {
        let [h, m] = (t || '00:00').split(':').map(Number);
        let ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m.toString().padStart(2,'0')} ${ampm}`;
    };
    
    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    displayItems.forEach(item => {
        const isClass = item.type === 'class';
        const isPending = item.type === 'pending_topic';
        const isMock = item.type === 'mock_test';
        const isExamReg = item.type === 'exam_register';
        let color = 'var(--neon-blue)';
        let icon = '&#128218;';
        if (isClass) { color = 'var(--neon-purple)'; icon = '&#127979;'; }
        else if (isPending) { color = 'var(--neon-gold)'; icon = '&#128203;'; }
        else if (isMock) { color = 'var(--neon-red)'; icon = '&#127919;'; }
        else if (isExamReg) { color = 'var(--neon-green)'; icon = '&#128196;'; }
        
        if (isExamReg) {
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; background:var(--glass-bg); padding:10px 12px; border-radius:10px; border-left: 3px solid ${item.status === 'completed' ? 'var(--glass-border)' : color}; ${item.status === 'completed' ? 'opacity:0.6;' : ''}">
                    <div style="display:flex; align-items:center; gap:10px; flex: 1; min-width: 0;">
                        <div style="width:24px; height:24px; flex-shrink: 0; border-radius:50%; background:var(--glass-bg); color:var(--text-main); display:flex; align-items:center; justify-content:center; font-size:0.8rem; box-shadow:0 2px 5px rgba(0,0,0,0.2);">${icon}</div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size:0.65rem; color:${color}; font-weight:700; text-transform:uppercase; margin-bottom:2px; letter-spacing:0.5px;">${escapeHtml(item.course)} &bull; EXAM REG</div>
                            <div style="font-size:0.9rem; font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${item.status==='completed' ? 'text-decoration:line-through; color:var(--text-muted);' : ''}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            const subj = AppState.subjects.find(sub => sub.id === item.subjectId);
            const subjName = subj ? subj.name : 'Unknown Subject';
            const courseStr = subj ? (subj.course || 'CSEB') : '';
            const displayTitle = [subjName, item.topic, item.title].filter(Boolean).join(' - ');
            
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; background:var(--glass-bg); padding:10px 12px; border-radius:10px; border-left: 3px solid ${item.status === 'completed' ? 'var(--glass-border)' : color}; ${item.status === 'completed' ? 'opacity:0.6;' : ''}">
                    <div style="display:flex; align-items:center; gap:10px; flex: 1; min-width: 0;">
                        <div style="width:24px; height:24px; flex-shrink: 0; border-radius:50%; background:var(--glass-bg); color:var(--text-main); display:flex; align-items:center; justify-content:center; font-size:0.8rem; box-shadow:0 2px 5px rgba(0,0,0,0.2);">${icon}</div>
                        <div style="flex: 1; min-width: 0;">
                            ${courseStr ? `<div style="font-size:0.65rem; color:${color}; font-weight:700; text-transform:uppercase; margin-bottom:2px; letter-spacing:0.5px;">${courseStr}</div>` : ''}
                            <div style="font-size:0.9rem; font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${item.status==='completed' ? 'text-decoration:line-through; color:var(--text-muted);' : ''}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; flex-shrink: 0;">
                        <div style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">
                            ${formatTimeStr(item.startTime)}
                        </div>
                        ${(!isClass && !isMock && item.status !== 'completed') ? `<button onclick="navigateTo('view-focus', {subjectId: '${item.subjectId}'})" style="background:var(--neon-blue); color:#000; border:none; padding:4px 8px; border-radius:4px; font-size:0.7rem; font-weight:bold; cursor:pointer;">FOCUS</button>` : ''}
                    </div>
                </div>
            `;
        }
    });
    
    if (todayItems.length > 3) {
        html += `<div style="text-align:center; padding-top:5px; font-size:0.8rem; color:var(--neon-blue); cursor:pointer;" onclick="document.querySelector('.nav-item[data-target=\\'view-schedule\\']').click()">+ ${todayItems.length - 3} more</div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// ==========================================
// DRAG-TO-SCROLL UTILITY FOR TOUCHPADS
// ==========================================
function makeDraggableScrollable(el) {
    if (!el) return;
    let isDown = false;
    let startX, startY, scrollLeft, scrollTop;

    el.style.cursor = 'grab';

    el.addEventListener('mousedown', (e) => {
        isDown = true;
        el.style.cursor = 'grabbing';
        startX = e.pageX - el.offsetLeft;
        startY = e.pageY - el.offsetTop;
        scrollLeft = el.scrollLeft;
        scrollTop = el.scrollTop;
    });

    el.addEventListener('mouseleave', () => { isDown = false; el.style.cursor = 'grab'; });
    el.addEventListener('mouseup', () => { isDown = false; el.style.cursor = 'grab'; });

    let ticking = false;

    el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const x = e.pageX - el.offsetLeft;
                const y = e.pageY - el.offsetTop;
                const walkX = (x - startX) * 1.5;
                const walkY = (y - startY) * 1.5;
                el.scrollLeft = scrollLeft - walkX;
                el.scrollTop = scrollTop - walkY;
                ticking = false;
            });
            ticking = true;
        }
    });

    // Translate vertical wheel to horizontal if it's a primarily horizontal container
    if (el.id === 'searchFilters' || el.style.overflowX === 'auto') {
        el.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && e.deltaX === 0) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Apply draggable scrolling to modals and hidden-scrollbar areas
    makeDraggableScrollable(document.getElementById('notificationsContainer'));
    makeDraggableScrollable(document.getElementById('achievementsBannerProfile'));
    makeDraggableScrollable(document.getElementById('searchFilters'));
    makeDraggableScrollable(document.querySelector('.study-heatmap-container'));
});

// ==========================================
// NOTIFICATIONS MODAL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('openNotificationsModalBtn');
    const closeBtn = document.getElementById('closeNotificationsModalBtn');
    const modal = document.getElementById('notificationsModal');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            renderNotifications();
            if (modal) modal.classList.add('active');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Give focus to scroll area on initial load for keyboard navigation
    const mainContent = document.getElementById('mainContentArea');
    if (mainContent) mainContent.focus();
});

// Tab Visibility handler to instantly refresh UI when user returns
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Force the interval to tick immediately if focus is running
        if (typeof focusState !== 'undefined' && focusState === 'running' && typeof focusTimerInterval !== 'undefined') {
            const now = Date.now();
            const diff = Math.floor((now - focusLastTick) / 1000);
            if (diff > 0) {
                focusLastTick += diff * 1000;
                if (typeof focusMode !== 'undefined' && focusMode === 'stopwatch') {
                    focusStopwatchSeconds += diff;
                    const display = document.getElementById('focusTimerDisplay');
                    if (display) {
                        const h = Math.floor(focusStopwatchSeconds / 3600);
                        const m = Math.floor((focusStopwatchSeconds % 3600) / 60).toString().padStart(2, '0');
                        const s = (focusStopwatchSeconds % 60).toString().padStart(2, '0');
                        display.textContent = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
                    }
                } else if (typeof focusSecondsRemaining !== 'undefined') {
                    focusSecondsRemaining -= diff;
                    if (focusSecondsRemaining < 0) focusSecondsRemaining = 0;
                    
                    const display = document.getElementById('focusTimerDisplay');
                    if (display) {
                        const h = Math.floor(focusSecondsRemaining / 3600);
                        const m = Math.floor((focusSecondsRemaining % 3600) / 60).toString().padStart(2, '0');
                        const s = (focusSecondsRemaining % 60).toString().padStart(2, '0');
                        display.textContent = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
                    }
                    
                    if (focusSecondsRemaining <= 0 && typeof focusState !== 'undefined') {
                        clearInterval(focusTimerInterval);
                        focusState = 'stopped';
                        document.getElementById('focusStartBtn').style.display = 'inline-block';
                        document.getElementById('focusPauseBtn').style.display = 'none';
                        if (typeof showLogOptions === 'function') {
                            showLogOptions();
                        }
                    }
                }
            }
        }
        
        // Ensure the dashboard overview updates instantly
        const overview = document.getElementById('view-overview');
        if (overview && overview.classList.contains('active')) {
            if (typeof renderOverview === 'function') {
                debouncedRenderOverview();
            }
        }
    }
});
