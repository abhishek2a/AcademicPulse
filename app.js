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
    CSEB_SYLLABUS: 'cseb_syllabus_tracker'
};

const DEFAULT_GOALS = { daily: 8, weekly: 40, monthly: 160 };
const CUTOFF_DATE = new Date('2026-02-15T00:00:00');

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_SUBJECTS = [
    // CSEB Subjects
    { id: generateId(), name: 'Banking (CSEB)', course: 'CSEB', color: '#2997FF', priority: 'High', targetHours: 5, totalHours: 0 },
    { id: generateId(), name: 'Co-operation (CSEB)', course: 'CSEB', color: '#30D158', priority: 'High', targetHours: 5, totalHours: 0 },
    { id: generateId(), name: 'KCS Act and Rules (CSEB)', course: 'CSEB', color: '#BF5AF2', priority: 'High', targetHours: 5, totalHours: 0 },
    { id: generateId(), name: 'English (CSEB)', course: 'CSEB', color: '#FFD60A', priority: 'Medium', targetHours: 3, totalHours: 0 },
    { id: generateId(), name: 'GK (CSEB)', course: 'CSEB', color: '#FF453A', priority: 'Low', targetHours: 2, totalHours: 0 },
    { id: generateId(), name: 'Reasoning (CSEB)', course: 'CSEB', color: '#FF9F0A', priority: 'Medium', targetHours: 3, totalHours: 0 },
    { id: generateId(), name: 'Accountancy (CSEB)', course: 'CSEB', color: '#32ADE6', priority: 'High', targetHours: 5, totalHours: 0 },
    
    // ACCA Subjects
    { id: generateId(), name: 'Financial Reporting (FR)', course: 'ACCA', color: '#0A84FF', priority: 'High', targetHours: 7, totalHours: 0 }
];

const EXAMS = [
    { category: 'CAT 11/2026 · TARGET', date: '2026-07-11T00:00:00', title: 'Junior Clerk / Cashier', subtext: 'Special Grade · Class-I Banks' },
    { category: 'CAT 10/2026 · UPCOMING', date: '2026-08-08T00:00:00', title: 'Junior Clerk / Cashier', subtext: 'Super Grade Banks' },
    { category: 'CAT 09/2026 · UPCOMING', date: '2026-08-16T00:00:00', title: 'Assistant Secretary', subtext: '' },
    { category: 'ACCA · UPCOMING', date: '2026-09-10T00:00:00', title: 'Financial Reporting (FR)', subtext: 'ACCA Certification' }
];

const AppState = {
    subjects: [],
    attendance: {},
    sessions: [],
    goals: DEFAULT_GOALS,
    accaTopics: [],
    mockTests: [],
    questionPractice: { attempted: 0, correct: 0 },
    csebSyllabus: {}
};

// ==========================================
// UTILITIES
// ==========================================
const Storage = {
    get(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch (e) { return fallback; }
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
        d1.setDate(d1.getDate() + 4 - (d1.getDay() || 7));
        const yearStart = new Date(d1.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d1 - yearStart) / 86400000) + 1) / 7);
        return `${d1.getFullYear()}-W${weekNo}`;
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
    }

    AppState.attendance = Storage.get(STORAGE_KEYS.ATTENDANCE, {});
    AppState.sessions = Storage.get(STORAGE_KEYS.SESSIONS, []);
    AppState.goals = Storage.get(STORAGE_KEYS.GOALS, DEFAULT_GOALS);
    
    AppState.accaTopics = Storage.get(STORAGE_KEYS.ACCA_TOPICS, []);
    if (AppState.accaTopics.length === 0) {
        AppState.accaTopics = [
            { name: "Conceptual Framework", completed: false },
            { name: "IAS 1 Presentation of Financial Statements", completed: false },
            { name: "IAS 16 Property, Plant & Equipment", completed: false },
            { name: "IAS 38 Intangible Assets", completed: false },
            { name: "IAS 36 Impairment", completed: false },
            { name: "IAS 37 Provisions", completed: false },
            { name: "IAS 2 Inventories", completed: false },
            { name: "IAS 7 Cash Flow Statements", completed: false },
            { name: "IFRS 15 Revenue", completed: false },
            { name: "Consolidation", completed: false },
            { name: "Interpretation Questions", completed: false }
        ];
    }
    
    // New tracking keys
    AppState.mockTests = Storage.get(STORAGE_KEYS.MOCKS, []);
    AppState.questionPractice = Storage.get(STORAGE_KEYS.PRACTICE, { attempted: 0, correct: 0 });
    AppState.csebSyllabus = Storage.get(STORAGE_KEYS.CSEB_SYLLABUS, {});
    
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
}

function saveData(key) {
    if (key === 'subjects') Storage.set(STORAGE_KEYS.SUBJECTS, AppState.subjects);
    if (key === 'attendance') Storage.set(STORAGE_KEYS.ATTENDANCE, AppState.attendance);
    if (key === 'sessions') Storage.set(STORAGE_KEYS.SESSIONS, AppState.sessions);
    if (key === 'goals') Storage.set(STORAGE_KEYS.GOALS, AppState.goals);
    if (key === 'accaTopics') Storage.set(STORAGE_KEYS.ACCA_TOPICS, AppState.accaTopics);
    if (key === 'mocks') Storage.set(STORAGE_KEYS.MOCKS, AppState.mockTests);
    if (key === 'practice') Storage.set(STORAGE_KEYS.PRACTICE, AppState.questionPractice);
    if (key === 'csebSyllabus') Storage.set(STORAGE_KEYS.CSEB_SYLLABUS, AppState.csebSyllabus);

    if (typeof window.triggerCloudSync === 'function') {
        window.triggerCloudSync();
    }
}

// ==========================================
// NAVIGATION
// ==========================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const targetId = item.getAttribute('data-target');
            sections.forEach(s => {
                s.classList.remove('active');
                if (s.id === targetId) s.classList.add('active');
            });

            // Re-render views on switch
            if (targetId === 'view-overview') renderOverview();
            if (targetId === 'view-analytics') renderAnalytics();
            if (targetId === 'view-attendance') renderAttendance();
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
            const subj = AppState.subjects.find(s => s.id === id);
            if (subj) { subj.name = name; subj.course = course; subj.color = color; subj.priority = priority; subj.targetHours = target; }
        } else {
            AppState.subjects.push({ id: generateId(), name, course, color, priority, targetHours: target, totalHours: 0 });
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
    const csebContainer = document.getElementById('csebSyllabusTrackerContainer');
    if(accaContainer) accaContainer.style.display = course === 'ACCA' ? 'block' : 'none';
    if(csebContainer) csebContainer.style.display = course === 'CSEB' ? 'block' : 'none';
    
    renderSubjects();
    if (course === 'ACCA') renderAccaTopicTracker();
    if (course === 'CSEB') renderCsebSyllabusTracker();
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
    
    // Recalculate total hours per subject
    const subjectTotals = {};
    AppState.sessions.forEach(s => {
        if (s.subjectId && s.endTime) {
            const duration = (new Date(s.endTime) - new Date(s.startTime)) / 1000;
            subjectTotals[s.subjectId] = (subjectTotals[s.subjectId] || 0) + duration;
        }
    });

    const filteredSubjects = AppState.subjects.filter(s => s.course === currentViewCourse || (!s.course && currentViewCourse === 'CSEB'));

    filteredSubjects.forEach(subj => {
        subj.totalHours = (subjectTotals[subj.id] || 0) / 3600;
        
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.style.setProperty('--sub-color', subj.color);
        
        card.innerHTML = `
            <div class="subject-meta">
                <span class="priority-tag priority-${subj.priority}">${subj.priority} Priority</span>
            </div>
            <div class="subject-title">${subj.name}</div>
            <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 15px;">
                Target: ${subj.targetHours}h / week<br>
                Studied: ${subj.totalHours.toFixed(1)}h Total
            </div>
            <div class="subject-actions">
                <button class="btn btn-outline" onclick="editSubject('${subj.id}')" style="padding: 6px 12px; font-size:0.8rem;">Edit</button>
                <button class="btn btn-outline" onclick="deleteSubject('${subj.id}')" style="padding: 6px 12px; font-size:0.8rem; color:var(--neon-red); border-color:var(--neon-red);">Delete</button>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function renderAccaTopicTracker() {
    const list = document.getElementById('accaTopicsList');
    if (!list) return;
    
    list.innerHTML = '';
    let completedCount = 0;
    
    AppState.accaTopics.forEach((topic, idx) => {
        if (topic.completed) completedCount++;
        
        const row = document.createElement('label');
        row.style.cssText = `display: flex; align-items: center; gap: 15px; padding: 12px 15px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; cursor: pointer; transition: 0.2s;`;
        
        row.onmouseover = () => row.style.background = 'var(--glass-border)';
        row.onmouseout = () => row.style.background = 'var(--glass-bg)';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = topic.completed;
        cb.style.cssText = `width: 20px; height: 20px; cursor: pointer; accent-color: var(--neon-blue);`;
        
        const text = document.createElement('span');
        text.textContent = topic.name;
        text.style.cssText = `font-size: 1rem; flex: 1; transition: 0.2s;`;
        text.style.textDecoration = topic.completed ? 'line-through' : 'none';
        text.style.color = topic.completed ? 'var(--text-muted)' : 'var(--text-main)';
        
        cb.onchange = (e) => {
            AppState.accaTopics[idx].completed = e.target.checked;
            saveData('accaTopics');
            renderAccaTopicTracker();
        };
        
        row.appendChild(cb);
        row.appendChild(text);
        list.appendChild(row);
    });
    
    const pct = Math.round((completedCount / AppState.accaTopics.length) * 100) || 0;
    document.getElementById('accaTopicProgress').textContent = `${pct}% (${completedCount}/${AppState.accaTopics.length})`;
    document.getElementById('accaTopicProgressBar').style.width = `${pct}%`;
}

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
        if (new Date(s.startTime) >= CUTOFF_DATE) {
            activeDays.add(TimeUtils.getDateKey(new Date(s.startTime)));
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
            const diff = (curDate - lastDate) / (1000*60*60*24);
            if (diff === 1) tempStreak++;
            else tempStreak = 1;
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
    if (hrs < 12) greeting = 'Good Morning';
    else if (hrs < 17) greeting = 'Good Afternoon';
    
    const name = AppState.user ? AppState.user.name.split(' ')[0] : 'User';
    document.getElementById('greetingTitle').textContent = `${greeting}, ${name}`;
    
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('currentDateDisplay').textContent = `${dateStr} • ${timeStr}`;

    const streaks = calculateStreaks();
    document.getElementById('studyStreakVal').textContent = streaks.current;
    document.getElementById('bestStudyStreakVal').textContent = `Best: ${streaks.best} days`;

    // Calculate Times
    let todaySecs = 0, monthSecs = 0;
    const todayKey = TimeUtils.getDateKey();
    const monthKey = TimeUtils.getMonthKey();

    AppState.sessions.forEach(s => {
        const dKey = TimeUtils.getDateKey(new Date(s.startTime));
        const mKey = TimeUtils.getMonthKey(new Date(s.startTime));
        const dur = s.duration || ((new Date(s.endTime) - new Date(s.startTime))/1000);
        
        if (dKey === todayKey) todaySecs += dur;
        if (mKey === monthKey) monthSecs += dur;
    });

    document.getElementById('todayTimeVal').textContent = TimeUtils.formatHours(todaySecs);
    document.getElementById('totalHoursVal').textContent = TimeUtils.formatHours(monthSecs);

    // Goals Progress
    // Daily
    const dGoalSecs = AppState.goals.daily * 3600;
    const dPct = Math.min(100, (todaySecs / dGoalSecs) * 100) || 0;
    document.getElementById('dailyGoalFill').style.width = `${dPct}%`;
    document.getElementById('dailyGoalText').textContent = `${(todaySecs/3600).toFixed(1)} / ${AppState.goals.daily}h`;

    // Weekly
    const weekKey = TimeUtils.getWeekKey();
    let weekSecs = 0;
    AppState.sessions.forEach(s => {
        if (TimeUtils.getWeekKey(new Date(s.startTime)) === weekKey) {
            weekSecs += s.duration || ((new Date(s.endTime) - new Date(s.startTime))/1000);
        }
    });
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
        if (recent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No recent sessions</td></tr>';
        } else {
            recent.forEach(log => {
                const subj = AppState.subjects.find(s => s.id === log.subjectId);
                const subjName = subj ? subj.name : 'Uncategorized';
                const color = subj ? subj.color : '#aaa';
                const timeStr = new Date(log.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                const durStr = TimeUtils.formatDisplay(log.duration || ((new Date(log.endTime)-new Date(log.startTime))/1000));
                
                tbody.innerHTML += `
                    <tr>
                        <td style="padding:15px 10px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="width:10px; height:10px; border-radius:50%; background:${color}"></div>
                                ${subjName}
                            </div>
                        </td>
                        <td style="padding:15px 10px;">${timeStr}</td>
                        <td style="padding:15px 10px; font-family:'Inter',monospace;">${durStr}</td>
                        <td style="padding:15px 10px; color:var(--text-muted); font-size:0.85rem;">${log.notes || '-'}</td>
                    </tr>
                `;
            });
        }
    }
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
        const yestStr = TimeUtils.getDateKey(new Date(now.setDate(now.getDate()-1)));
        
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
    document.getElementById('attendancePercentVal').textContent = `${pct}%`;
    
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
        const examDate = new Date(exam.date);
        const diffTime = examDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let daysText = diffDays > 0 ? `${diffDays} days left` : diffDays === 0 ? "Today!" : "Passed";
        let daysColor = diffDays > 0 ? "#30D158" : diffDays === 0 ? "#FFD60A" : "#FF453A";
        
        const formattedDate = examDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        const card = document.createElement('div');
        card.className = 'exam-card';
        card.innerHTML = `
            <div class="exam-meta">${exam.category}</div>
            <div class="exam-date">${formattedDate}</div>
            <div class="exam-title">${exam.title}${exam.subtext ? `<br><span style="font-size:0.8rem; color:#6E6E73;">${exam.subtext}</span>` : ''}</div>
            <div class="exam-days" style="color: ${daysColor}">${daysText}</div>
        `;
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

    const daySessions = AppState.sessions.filter(s => s.startTime.startsWith(dateKey));
    const content = document.getElementById('dayReportContent');
    const totalDiv = document.getElementById('dayReportTotal');
    
    if (daySessions.length === 0) {
        totalDiv.textContent = 'Total Studied: 0h 0m';
        content.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">No sessions logged for this day.</div>';
        return;
    }

    let totalDuration = 0;
    let html = '';

    daySessions.forEach(s => {
        totalDuration += s.duration;
        const subj = AppState.subjects.find(sub => sub.id === s.subjectId) || { name: 'Unknown', color: 'var(--text-main)' };
        
        let hrs = Math.floor(s.duration / 3600);
        let mins = Math.floor((s.duration % 3600) / 60);
        let timeStr = '';
        if (hrs > 0) timeStr += `${hrs}h `;
        timeStr += `${mins}m`;

        html += `
            <div class="report-session-item" style="border-left: 4px solid ${subj.color}">
                <div class="report-session-header">
                    <span>${subj.name}</span>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="color: var(--neon-blue);">${timeStr}</span>
                        <button onclick="deleteSession('${s.id}')" style="background:transparent; border:none; color:var(--neon-red); cursor:pointer; font-size:1.1rem; padding:0; line-height:1;" title="Delete Session">×</button>
                    </div>
                </div>
                <div class="report-session-notes">${s.notes || 'No notes'}</div>
            </div>
        `;
    });

    let totalHrs = Math.floor(totalDuration / 3600);
    let totalMins = Math.floor((totalDuration % 3600) / 60);
    totalDiv.textContent = `Total Studied: ${totalHrs}h ${totalMins}m`;
    
    content.innerHTML = html;
}

window.deleteSession = function(sessionId) {
    if (!confirm("Are you sure you want to delete this recorded session?")) return;
    
    const session = AppState.sessions.find(s => s.id === sessionId);
    if (session) {
        AppState.sessions = AppState.sessions.filter(s => s.id !== sessionId);
        saveData('sessions');
        
        // Find if this was the only session for that date. If so, we could potentially clear attendance, but for now we just delete the session.
        renderOverview();
        renderAttendance();
        renderAnalytics();
        
        // Re-render the currently open day report
        const dateKey = TimeUtils.getDateKey(new Date(session.startTime));
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

function renderAnalytics() {
    generateSmartInsights();
    
    const now = new Date();
    const todayKey = TimeUtils.getDateKey(now);
    const thisWeekKey = TimeUtils.getWeekKey(now);
    const thisMonthKey = TimeUtils.getMonthKey(now);
    
    // Core aggregates
    let totalSecs = 0, todaySecs = 0, weekSecs = 0, monthSecs = 0;
    const subjTotals = {};
    const dailyData = {};
    const monthlyData = {};
    
    // Pre-populate last 14 days for line chart
    const last14Days = [];
    for(let i=13; i>=0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const k = TimeUtils.getDateKey(d);
        last14Days.push(k);
        dailyData[k] = 0;
    }
    
    // Pre-populate last 6 months for bar chart
    const last6Months = [];
    for(let i=5; i>=0; i--) {
        const d = new Date(); d.setMonth(d.getMonth()-i);
        const k = TimeUtils.getMonthKey(d);
        last6Months.push(k);
        monthlyData[k] = 0;
    }

    // Process Sessions
    AppState.sessions.forEach(s => {
        const d = new Date(s.startTime);
        const dKey = TimeUtils.getDateKey(d);
        const wKey = TimeUtils.getWeekKey(d);
        const mKey = TimeUtils.getMonthKey(d);
        const dur = s.duration || ((new Date(s.endTime) - d)/1000);
        
        totalSecs += dur;
        if (dKey === todayKey) todaySecs += dur;
        if (wKey === thisWeekKey) weekSecs += dur;
        if (mKey === thisMonthKey) monthSecs += dur;
        
        if (s.subjectId) subjTotals[s.subjectId] = (subjTotals[s.subjectId] || 0) + dur;
        if (dailyData[dKey] !== undefined) dailyData[dKey] += dur;
        if (monthlyData[mKey] !== undefined) monthlyData[mKey] += dur;
    });

    // Overview Cards
    const streaks = calculateStreaks();
    const e = (id) => document.getElementById(id);
    if(e('anaTotalHours')) e('anaTotalHours').textContent = (totalSecs/3600).toFixed(1) + 'h';
    if(e('anaTodayHours')) e('anaTodayHours').textContent = (todaySecs/3600).toFixed(1) + 'h';
    if(e('anaStreak')) e('anaStreak').textContent = streaks.current;
    
    // Time Distributions
    if(e('distToday')) e('distToday').textContent = TimeUtils.formatHours(todaySecs);
    if(e('distWeek')) e('distWeek').textContent = TimeUtils.formatHours(weekSecs);
    if(e('distMonth')) e('distMonth').textContent = TimeUtils.formatHours(monthSecs);
    if(e('distAll')) e('distAll').textContent = TimeUtils.formatHours(totalSecs);

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
        subjArr.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--glass-border)';
            const pct = totalSecs > 0 ? Math.round((item.dur/totalSecs)*100) : 0;
            tr.innerHTML = `<td style="padding: 12px 10px;">${getSubjName(item.id)}</td><td style="padding: 12px 10px;">${(item.dur/3600).toFixed(1)}h</td><td style="padding: 12px 10px;">${pct}%</td>`;
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
    }
    
    // Attendance Analytics
    let pres = 0, abs = 0, lev = 0;
    Object.values(AppState.attendance).forEach(val => { if(val==='Present') pres++; if(val==='Absent') abs++; if(val==='Leave') lev++; });
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

    // Analytics: Practice
    let pracAtt = 0, pracCor = 0;
    if (Array.isArray(AppState.questionPractice)) {
        AppState.questionPractice.forEach(p => { pracAtt += p.attempted; pracCor += p.correct; });
    } else {
        pracAtt = AppState.questionPractice.attempted || 0;
        pracCor = AppState.questionPractice.correct || 0;
    }
    
    if(e('anaPracticeAttempted')) e('anaPracticeAttempted').textContent = pracAtt;
    if(e('anaPracticeCorrect')) e('anaPracticeCorrect').innerHTML = `${pracCor} <span style="font-size:1rem; color: var(--text-muted);">(${pracAtt > 0 ? Math.round((pracCor/pracAtt)*100) : 0}%)</span>`;

    // Analytics: Mocks
    const mockContainer = e('anaMockTrendContainer');
    if(mockContainer) {
        if(AppState.mockTests.length === 0) {
            mockContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No mock tests logged yet.</div>';
        } else {
            mockContainer.innerHTML = '';
            const recentMocks = [...AppState.mockTests].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
            recentMocks.forEach(m => {
                const pct = Math.round((m.score / m.maxScore) * 100);
                let color = 'var(--neon-green)';
                if(pct < 50) color = 'var(--neon-red)';
                else if(pct < 75) color = 'var(--neon-gold)';
                mockContainer.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 500; font-size: 0.9rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</span>
                        <div style="flex: 2; margin: 0 15px; background: var(--glass-border); height: 8px; border-radius: 4px;"><div style="width: ${pct}%; background: ${color}; height: 100%; border-radius: 4px;"></div></div>
                        <span style="font-weight: 600; color: var(--text-main); font-size: 0.9rem; width: 40px; text-align: right;">${pct}%</span>
                    </div>
                `;
            });
        }
    }

    // Analytics: CSEB Coverage
    const csebContainer = e('anaCsebCoverageContainer');
    if(csebContainer) {
        if(Object.keys(AppState.csebSyllabus).length === 0) {
            csebContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No syllabus data yet.</div>';
        } else {
            csebContainer.innerHTML = '';
            Object.keys(AppState.csebSyllabus).forEach(subjName => {
                const topics = AppState.csebSyllabus[subjName];
                let comp = 0;
                topics.forEach(t => { if(t.completed) comp++; });
                const pct = topics.length > 0 ? Math.round((comp / topics.length) * 100) : 0;
                let color = 'var(--neon-blue)';
                if(pct > 80) color = 'var(--neon-green)';
                else if(pct > 40) color = 'var(--neon-gold)';
                else if(pct > 0) color = 'var(--neon-purple)';
                else color = 'var(--text-muted)';
                
                csebContainer.innerHTML += `
                    <div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.85rem;"><span>${subjName}</span><span style="color:${color};">${pct}%</span></div>
                        <div class="progress-bar-bg" style="height: 6px;"><div class="progress-bar-fill" style="background: ${color}; width: ${pct}%;"></div></div>
                    </div>
                `;
            });
        }
    }

    // Analytics: ACCA Coverage
    const accaContainer = e('anaAccaTopicList');
    if(accaContainer) {
        if(AppState.accaTopics.length === 0) {
            accaContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No syllabus data yet.</div>';
        } else {
            accaContainer.innerHTML = '';
            AppState.accaTopics.forEach(t => {
                const pct = t.completed ? 100 : 0;
                let color = t.completed ? 'var(--neon-green)' : 'var(--glass-border)';
                accaContainer.innerHTML += `
                    <div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.85rem;"><span>${t.name}</span><span style="color:${color};">${pct}%</span></div>
                        <div class="progress-bar-bg" style="height: 6px; background: var(--glass-bg);"><div class="progress-bar-fill" style="background: ${color}; width: ${pct}%;"></div></div>
                    </div>
                `;
            });
        }
    }

    renderAnalyticsCharts(last14Days, dailyData, last6Months, monthlyData, subjArr);
    renderConsistencyHeatmap();
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

    const pieCtx = document.getElementById('subjectPieChart');
    if (pieCtx) {
        if (subjectPieChartInst) subjectPieChartInst.destroy();
        const labels = subjArr.map(s => { const b=AppState.subjects.find(x=>x.id===s.id); return b?b.name:'-'; });
        const data = subjArr.map(s => s.dur/3600);
        const colors = subjArr.map(s => { const b=AppState.subjects.find(x=>x.id===s.id); return b?b.color:'#555'; });
        subjectPieChartInst = new Chart(pieCtx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
            options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'right', labels: { color: 'var(--text-main)' } } } }
        });
    }
}

function renderConsistencyHeatmap() {
    const grid = document.getElementById('studyHeatmap');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Configure GitHub-style layout
    grid.style.display = 'grid';
    grid.style.gridTemplateRows = 'repeat(7, 1fr)';
    grid.style.gridAutoFlow = 'column';
    grid.style.gap = '4px';
    
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 120);
    
    const studyMap = {};
    AppState.sessions.forEach(s => {
        const d = TimeUtils.getDateKey(new Date(s.startTime));
        studyMap[d] = (studyMap[d] || 0) + (s.duration || ((new Date(s.endTime)-new Date(s.startTime))/1000));
    });
    
    let bestDur = 0, bestDay = null;
    let currDate = new Date(startDate);
    
    while (currDate <= now) {
        const k = TimeUtils.getDateKey(currDate);
        const dur = studyMap[k] || 0;
        if(dur > bestDur) { bestDur = dur; bestDay = k; }
        
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.style.width = '12px'; cell.style.height = '12px'; cell.style.borderRadius = '3px';
        cell.title = `${k}: ${(dur/3600).toFixed(1)}h`;
        
        if (dur === 0) cell.style.background = 'var(--glass-border)';
        else if (dur < 7200) cell.style.background = 'rgba(48, 209, 88, 0.3)';
        else if (dur < 18000) cell.style.background = 'rgba(48, 209, 88, 0.6)';
        else cell.style.background = 'rgba(48, 209, 88, 1)';
        
        grid.appendChild(cell);
        currDate.setDate(currDate.getDate() + 1);
    }
    
    if(document.getElementById('bestStudyDayStr')) {
        document.getElementById('bestStudyDayStr').textContent = bestDay || '-';
        document.getElementById('bestStudyDayAvg').textContent = bestDay ? `Logged ${(bestDur/3600).toFixed(1)} Hours` : 'Average: 0 Hours';
    }
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

    AppState.sessions.forEach(s => {
        const d = new Date(s.startTime);
        const dur = s.duration || ((new Date(s.endTime) - d)/1000);
        
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
            const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
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
                html += `<div class="insight-box" style="border-left-color: var(--neon-red);"><strong>Review Needed:</strong> You haven't studied High Priority subject '${subj.name}' in ${daysSince} days.</div>`;
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
    });

    document.getElementById('saveLogBtn').addEventListener('click', () => {
        const dateKey = document.getElementById('logDateInput').value;
        const subjectId = document.getElementById('logSubjectInput').value;
        const notes = document.getElementById('logNotesInput').value;
        const hours = parseInt(document.getElementById('logHoursInput').value) || 0;
        const minutes = parseInt(document.getElementById('logMinutesInput').value) || 0;
        
        if (!dateKey || !subjectId) return alert('Date and Subject are required.');
        
        const durationSecs = (hours * 3600) + (minutes * 60);
        if (durationSecs <= 0) return alert('Duration must be greater than 0.');

        const sessionStart = new Date(dateKey + 'T12:00:00Z'); // Fake time in middle of day
        const sessionEnd = new Date(sessionStart.getTime() + (durationSecs * 1000));

        AppState.sessions.push({
            id: generateId(),
            subjectId: subjectId,
            notes: notes,
            startTime: sessionStart.toISOString(),
            endTime: sessionEnd.toISOString(),
            duration: durationSecs
        });

        // Mark present
        AppState.attendance[dateKey] = 'present';
        
        saveData('sessions');
        saveData('attendance');
        
        document.getElementById('logSessionModal').classList.remove('active');
        renderOverview();
        renderAttendance();
        renderAnalytics();
    });

    document.getElementById('logCourseInput').addEventListener('change', (e) => {
        populateLogSubjects(e.target.value);
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
}

function openLogSessionModal(dateKey) {
    document.getElementById('logDateInput').value = dateKey;
    document.getElementById('logNotesInput').value = '';
    document.getElementById('logHoursInput').value = '1';
    document.getElementById('logMinutesInput').value = '0';
    
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
        renderOverview();
        document.getElementById('editGoalsModal').classList.remove('active');
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
window.initApp = function() {
    try {
        loadData();
        initTheme();
        initNavigation();
        initSubjects();
        initRetrospectiveLogging();
        initEditGoals();
        initMocksAndPractice();
        renderOverview();
        
        // Start live clock for dashboard
        setInterval(() => {
            if (document.getElementById('view-overview').classList.contains('active')) {
                renderOverview();
            }
        }, 30000); // Update every 30 seconds
        
        // Unregister Service Worker to prevent extreme mobile caching during development
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
            // Purge caches
            caches.keys().then(function(names) {
                for (let name of names) caches.delete(name);
            });
        }

        setTimeout(() => {
            document.getElementById('loadingOverlay').classList.remove('active');
        }, 500);
        
    } catch (error) {
        console.error("Init Error:", error);
        document.getElementById('loadingOverlay').classList.remove('active');
    }
};

// ==========================================
// MOCKS & PRACTICE
// ==========================================
function initMocksAndPractice() {
    const attemptedTxt = document.getElementById('practiceAttemptedTxt');
    const correctTxt = document.getElementById('practiceCorrectTxt');
    
    // Calculate global totals from array or legacy object
    let totalAtt = 0, totalCor = 0;
    if (Array.isArray(AppState.questionPractice)) {
        AppState.questionPractice.forEach(p => { totalAtt += p.attempted; totalCor += p.correct; });
    } else {
        totalAtt = AppState.questionPractice.attempted || 0;
        totalCor = AppState.questionPractice.correct || 0;
    }
    
    if (attemptedTxt) attemptedTxt.textContent = totalAtt;
    if (correctTxt) correctTxt.innerHTML = `${totalCor} <span style="font-size:1rem; color: var(--text-muted);">(${totalAtt > 0 ? Math.round((totalCor/totalAtt)*100) : 0}%)</span>`;

    // Populate Subjects Dropdown
    const courseSelect = document.getElementById('practiceCourseInput');
    const subjSelect = document.getElementById('practiceSubjectInput');
    
    const populatePracticeSubjects = (course) => {
        if(!subjSelect) return;
        subjSelect.innerHTML = '';
        const filtered = AppState.subjects.filter(s => s.course === course || (!s.course && course === 'CSEB'));
        filtered.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            subjSelect.appendChild(opt);
        });
    };
    
    if(courseSelect) {
        courseSelect.addEventListener('change', (e) => populatePracticeSubjects(e.target.value));
        populatePracticeSubjects(courseSelect.value);
    }

    document.getElementById('practiceAddBtn')?.addEventListener('click', () => {
        const addAtt = parseInt(document.getElementById('practiceAddAttempted').value) || 0;
        const addCor = parseInt(document.getElementById('practiceAddCorrect').value) || 0;
        if(addAtt === 0 && addCor === 0) return;
        
        const c = document.getElementById('practiceCourseInput')?.value;
        const sId = document.getElementById('practiceSubjectInput')?.value;
        
        if (!Array.isArray(AppState.questionPractice)) {
            // Migrate legacy object to array
            const legacyAtt = AppState.questionPractice.attempted || 0;
            const legacyCor = AppState.questionPractice.correct || 0;
            AppState.questionPractice = [];
            if(legacyAtt > 0) {
                AppState.questionPractice.push({ id: generateId(), date: new Date().toISOString(), course: 'Legacy', subjectId: null, attempted: legacyAtt, correct: legacyCor });
            }
        }
        
        AppState.questionPractice.push({
            id: generateId(),
            date: new Date().toISOString(),
            course: c,
            subjectId: sId,
            attempted: addAtt,
            correct: addCor
        });
        
        saveData('practice');
        
        document.getElementById('practiceAddAttempted').value = '';
        document.getElementById('practiceAddCorrect').value = '';
        initMocksAndPractice(); // Re-render this section
        renderAnalytics(); // Re-render analytics dashboard
    });

    document.getElementById('saveMockBtn')?.addEventListener('click', () => {
        const course = document.getElementById('mockCourseInput').value;
        const name = document.getElementById('mockNameInput').value;
        const score = parseFloat(document.getElementById('mockScoreInput').value) || 0;
        const max = parseFloat(document.getElementById('mockMaxScoreInput').value) || 100;
        
        if(!name) return alert('Mock Name is required!');
        
        AppState.mockTests.push({
            id: generateId(),
            date: new Date().toISOString(),
            course,
            name,
            score,
            maxScore: max
        });
        
        saveData('mocks');
        document.getElementById('mockNameInput').value = '';
        document.getElementById('mockScoreInput').value = '';
        renderMocksHistory();
        renderAnalytics();
    });

    renderMocksHistory();
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
        const pct = Math.round((m.score / m.maxScore) * 100);
        let color = 'var(--neon-green)';
        if(pct < 50) color = 'var(--neon-red)';
        else if(pct < 75) color = 'var(--neon-gold)';
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding:15px 10px;">${new Date(m.date).toLocaleDateString()}</td>
                <td style="padding:15px 10px;">${m.course}</td>
                <td style="padding:15px 10px;">${m.name}</td>
                <td style="padding:15px 10px; font-weight:700; color:${color}">${m.score} / ${m.maxScore} (${pct}%)</td>
            </tr>
        `;
    });
}

// ==========================================
// CSEB SYLLABUS TRACKER
// ==========================================
function renderCsebSyllabusTracker() {
    const list = document.getElementById('csebSyllabusList');
    if (!list) return;
    
    list.innerHTML = '';
    let totalTopics = 0;
    let completedTopics = 0;
    
    Object.keys(AppState.csebSyllabus).forEach(subjectName => {
        const topics = AppState.csebSyllabus[subjectName];
        
        let subjHtml = `
            <div style="background: var(--glass-bg); border: 1px solid var(--glass-border); padding: 15px; border-radius: 12px;">
                <h4 style="margin: 0 0 10px 0; color: var(--neon-blue); font-size: 1rem;">${subjectName}</h4>
                <div style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        topics.forEach((topic, idx) => {
            totalTopics++;
            if (topic.completed) completedTopics++;
            
            const checkboxId = `cseb_${subjectName.replace(/\s+/g, '')}_${idx}`;
            subjHtml += `
                <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 5px 0;">
                    <input type="checkbox" id="${checkboxId}" ${topic.completed ? 'checked' : ''} style="margin-top: 3px;">
                    <span style="${topic.completed ? 'text-decoration: line-through; color: var(--text-muted);' : 'color: #eee;'} font-size: 0.9rem;">
                        ${topic.name}
                    </span>
                </label>
            `;
        });
        
        subjHtml += `</div></div>`;
        list.innerHTML += subjHtml;
    });
    
    const pct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
    document.getElementById('csebSyllabusProgress').textContent = `${pct}%`;
    document.getElementById('csebSyllabusProgressBar').style.width = `${pct}%`;
    
    // Attach event listeners
    Object.keys(AppState.csebSyllabus).forEach(subjectName => {
        const topics = AppState.csebSyllabus[subjectName];
        topics.forEach((topic, idx) => {
            const el = document.getElementById(`cseb_${subjectName.replace(/\s+/g, '')}_${idx}`);
            if (el) {
                el.addEventListener('change', (e) => {
                    topic.completed = e.target.checked;
                    saveData('csebSyllabus');
                    renderCsebSyllabusTracker();
                    renderAnalytics(); // Re-render analytics on change
                });
            }
        });
    });
}

