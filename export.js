async function loadPdfLibraries() {
    if (window.jspdf && window.jspdf.jsPDF && window.pdfjsLib) return;
    
    document.getElementById('loadingOverlay')?.classList.add('active');
    
    const loadScript = (src) => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });

    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js')
        ]);
    } catch (e) {
        console.error("Error loading PDF scripts", e);
    }
    document.getElementById('loadingOverlay')?.classList.remove('active');
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const btnDaily = document.getElementById('btnExportDaily');
        const btnStudy = document.getElementById('btnExportStudy');
        const btnMonthly = document.getElementById('btnExportMonthly');
        const btnAttendance = document.getElementById('btnExportAttendance');

        if (btnDaily) btnDaily.addEventListener('click', async () => { await loadPdfLibraries(); generateDailyReport(); });
        if (btnStudy) btnStudy.addEventListener('click', async () => { await loadPdfLibraries(); generateStudyReport(); });
        if (btnMonthly) btnMonthly.addEventListener('click', async () => { await loadPdfLibraries(); generateMonthlyReport(); });
        if (btnAttendance) btnAttendance.addEventListener('click', async () => { await loadPdfLibraries(); generateAttendanceReport(); });
    }, 500);
});

function setupPDF() {
    const doc = new window.jspdf.jsPDF();
    doc.setFont("helvetica");
    return doc;
}

function addPdfHeader(doc, title, color, subtitle) {
    const studentName = document.getElementById('profileDisplayName')?.textContent || 'Student';

    doc.setFontSize(22);
    doc.setTextColor(...color);
    doc.text(title, 14, 22);

    // Add Student Name aligned to the right
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    const studentText = `Student: ${studentName}`;
    const textWidth = doc.getStringUnitWidth(studentText) * doc.internal.getFontSize() / doc.internal.scaleFactor;
    doc.text(studentText, 210 - 14 - textWidth, 22);

    doc.setFontSize(10);
    doc.setTextColor(130, 130, 130);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    if (subtitle) {
        doc.setFontSize(11);
        doc.setTextColor(80, 80, 80);
        doc.text(subtitle, 14, 38);
        return 46;
    }
    return 38;
}

function generateDailyReport() {
    const doc = setupPDF();
    const today = new Date();
    const todayStr = today.toLocaleDateString();
    const todayKey = typeof TimeUtils !== 'undefined' && TimeUtils.getDateKey ? TimeUtils.getDateKey(today) : today.toISOString().split('T')[0];

    // Filter today's sessions
    const todaysSessions = AppState.sessions.filter(s => {
        const dk = typeof TimeUtils !== 'undefined' && TimeUtils.getDateKey ? TimeUtils.getDateKey(new Date(s.startTime)) : new Date(s.startTime).toISOString().split('T')[0];
        return dk === todayKey;
    });

    let totalSeconds = 0;
    let focusSeconds = 0;
    const subjectStats = {};
    const hourBlocks = {};
    const tasksCompleted = [];
    const coursesStudied = new Set();

    todaysSessions.forEach(s => {
        const dur = s.duration || (s.endTime ? (new Date(s.endTime) - new Date(s.startTime)) / 1000 : 0);
        totalSeconds += dur;
        if (s.isFocusMode) focusSeconds += dur;

        const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
        const subjName = subj ? subj.name : 'Unknown';
        subjectStats[subjName] = (subjectStats[subjName] || 0) + dur;
        
        if (subj && subj.course) coursesStudied.add(subj.course);
        
        if (s.topic) {
            tasksCompleted.push(`${subjName}: ${s.topic}`);
        } else if (s.topics && s.topics.length > 0) {
            tasksCompleted.push(`${subjName}: ${s.topics.join(', ')}`);
        } else if (subjName !== 'Unknown') {
            if (!tasksCompleted.includes(subjName)) tasksCompleted.push(subjName);
        }

        const startHour = new Date(s.startTime).getHours();
        hourBlocks[startHour] = (hourBlocks[startHour] || 0) + dur;
    });

    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMins = Math.floor((totalSeconds % 3600) / 60);
    const timeStr = `${totalHours}h ${totalMins}m`;

    const focusScore = totalSeconds > 0 ? Math.round((focusSeconds / totalSeconds) * 100) : 0;
    const dailyTarget = AppState.goals?.daily || 6;
    const goalMet = (totalSeconds / 3600) >= dailyTarget ? 'Yes' : 'No';

    // Peak focus time
    let peakHour = -1;
    let maxDur = 0;
    Object.entries(hourBlocks).forEach(([hr, dur]) => {
        if (dur > maxDur) {
            maxDur = dur;
            peakHour = parseInt(hr);
        }
    });
    
    const formatAMPM = (hr) => {
        const ampm = hr >= 12 ? 'PM' : 'AM';
        const h = hr % 12 || 12;
        return `${h}:00 ${ampm} - ${h === 11 ? '12:00 PM' : hr === 23 ? '12:00 AM' : (h+1)+':00 '+ampm}`;
    };
    const peakTimeStr = peakHour >= 0 ? formatAMPM(peakHour) : 'N/A';

    // Daily streak
    let streak = 0, cur = 0;
    const studyDays = new Set(AppState.sessions.map(s => {
        return typeof TimeUtils !== 'undefined' && TimeUtils.getDateKey ? TimeUtils.getDateKey(new Date(s.startTime)) : new Date(s.startTime).toISOString().split('T')[0];
    }));
    
    // Check backwards from today
    let checkDate = new Date();
    for (let i = 0; i < 365; i++) {
        const dk = typeof TimeUtils !== 'undefined' && TimeUtils.getDateKey ? TimeUtils.getDateKey(checkDate) : checkDate.toISOString().split('T')[0];
        if (studyDays.has(dk)) { 
            cur++; 
            streak = cur; 
        } else if (i > 0) { 
            break; 
        }
        checkDate.setDate(checkDate.getDate() - 1);
    }

    // Tomorrow's plan
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = typeof TimeUtils !== 'undefined' && TimeUtils.getDateKey ? TimeUtils.getDateKey(tomorrow) : tomorrow.toISOString().split('T')[0];
    
    const tomorrowsPlan = AppState.schedule ? AppState.schedule.filter(s => s.date === tomorrowKey) : [];

    // PDF Generation
    let y = addPdfHeader(doc, `Daily Report — ${todayStr}`, [0, 0, 0], 'AcademicPulse · Day Analysis');
    
    // Add Day ID (BETA ONLY)
    const isBetaUser = localStorage.getItem('academicpulse_beta_opt_in') === 'true';
    if (isBetaUser) {
        const dayId = `DAY-${todayKey.replace(/-/g, '')}`;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        // Align right, below the date
        doc.text(`ID: ${dayId}`, 210 - 14 - (doc.getStringUnitWidth(`ID: ${dayId}`) * 10 / doc.internal.scaleFactor), 30);
    }

    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text('Core Time Metrics', 14, y + 6);
    y += 10;

    doc.autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: [
            ['Total Study Time', timeStr],
            ['Course(s) Studied', coursesStudied.size > 0 ? Array.from(coursesStudied).join(', ') : 'None'],
            ['Session Count', `${todaysSessions.length}`],
            ['Efficiency / Focus Score', `${focusScore}% of time in Focus Mode`],
            ['Peak Productivity Time', peakTimeStr]
        ],
        theme: 'striped',
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 5 },
        alternateRowStyles: { fillColor: [248, 248, 248] }
    });

    y = doc.lastAutoTable.finalY + 10;

    // Achievements
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text('Achievements & Progress', 14, y + 4);
    y += 8;

    // Word wrap portions studied
    const portions = tasksCompleted.length > 0 ? tasksCompleted.join(', ') : 'None logged';
    
    doc.autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: [
            ['Daily Goal Met', `${goalMet} (Target: ${dailyTarget}h)`],
            ['Current Streak', `${streak} day${streak !== 1 ? 's' : ''}`],
            ['Portions Studied Today', portions]
        ],
        theme: 'striped',
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 5 },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: { 1: { cellWidth: 130 } }
    });

    y = doc.lastAutoTable.finalY + 10;
    
    // Subject Breakdown
    if (Object.keys(subjectStats).length > 0) {
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        doc.text('Subject Breakdown', 14, y + 4);
        y += 8;
        
        const subjRows = Object.entries(subjectStats).map(([subj, secs]) => {
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            return [subj, `${h}h ${m}m`];
        });
        
        doc.autoTable({
            startY: y,
            head: [['Subject', 'Time Spent']],
            body: subjRows,
            theme: 'striped',
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
            styles: { fontSize: 10, cellPadding: 5 },
            alternateRowStyles: { fillColor: [248, 248, 248] }
        });
        
        y = doc.lastAutoTable.finalY + 10;
    }

    // Today's Study Log
    if (todaysSessions.length > 0) {
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        doc.text("Today's Study Log", 14, y + 4);
        y += 8;

        const sortedSessions = [...todaysSessions].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        const logRows = sortedSessions.map(s => {
            const startD = new Date(s.startTime);
            const timeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
            const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
            const subjName = subj ? subj.name : 'Unknown';
            let sessionName = s.topic || (s.topics && s.topics.length ? s.topics.join(', ') : '');
            if (s.notes) {
                sessionName += sessionName ? ` - ${s.notes}` : s.notes;
            }
            if (!sessionName) sessionName = '-';
            
            const typeLabels = {
                study: 'Self Study',
                revision: 'Revision',
                class: 'Class',
                pending_topic: 'Pending Topic',
                mock_test: 'Mock Test'
            };
            const typeStr = s.type && typeLabels[s.type] ? typeLabels[s.type] : (s.type || 'Self Study');
            let typePlatformStr = typeStr;
            if (s.classPlatform) {
                typePlatformStr += `\n(${s.classPlatform})`;
            }
            
            const dur = s.duration || (s.endTime ? (new Date(s.endTime) - startD) / 1000 : 0);
            const durH = Math.floor(dur / 3600);
            const durM = Math.floor((dur % 3600) / 60);
            const durStr = durH > 0 ? `${durH}h ${durM}m` : `${durM}m`;

            return [timeStr, subjName, sessionName, typePlatformStr, durStr];
        });

        doc.autoTable({
            startY: y,
            head: [['Time', 'Subject', 'Session Name', 'Type / Platform', 'Duration']],
            body: logRows,
            theme: 'striped',
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
            styles: { fontSize: 9, cellPadding: 5 },
            alternateRowStyles: { fillColor: [248, 248, 248] }
        });
        
        y = doc.lastAutoTable.finalY + 10;
    }

    // Tomorrow's Plan
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("What's Planned for Tomorrow", 14, y + 4);
    y += 8;

    if (tomorrowsPlan.length > 0) {
        const planRows = tomorrowsPlan.map(p => {
            const subj = AppState.subjects.find(s => s.id === p.subjectId);
            const subjName = subj ? subj.name : 'Unknown';
            const t = p.title || p.topic || (p.topics && p.topics.length ? p.topics.join(', ') : 'Study');
            return [p.startTime, subjName, t];
        });
        
        doc.autoTable({
            startY: y,
            head: [['Time', 'Subject', 'Task']],
            body: planRows,
            theme: 'striped',
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
            styles: { fontSize: 10, cellPadding: 5 },
            alternateRowStyles: { fillColor: [248, 248, 248] }
        });
    } else {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Nothing scheduled for tomorrow yet.", 14, y + 2);
    }

    doc.save(`Day_Report_${todayKey}.pdf`);
}

function generateStudyReport() {
    const doc = setupPDF();

    // ── Summary stats ────────────────────────────────────────────────
    let totalSeconds = 0;
    const subjectStats = {};
    AppState.subjects.forEach(s => {
        subjectStats[s.id] = {
            name: s.name, course: s.course, priority: s.priority,
            totalSeconds: 0, weekSeconds: 0, targetHours: s.targetHours,
            sessions: 0, lastStudied: null
        };
    });

    const now = new Date();
    const currentWeekStart = new Date(now);
    currentWeekStart.setHours(0,0,0,0);
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

    AppState.sessions.forEach(s => {
        const dur = s.duration || (s.endTime ? (new Date(s.endTime) - new Date(s.startTime)) / 1000 : 0);
        totalSeconds += dur;
        if (subjectStats[s.subjectId]) {
            subjectStats[s.subjectId].totalSeconds += dur;
            
            const d = new Date(s.startTime || s.date);
            if (d >= currentWeekStart) {
                subjectStats[s.subjectId].weekSeconds += dur;
            }
            
            subjectStats[s.subjectId].sessions++;
            if (!subjectStats[s.subjectId].lastStudied || d > subjectStats[s.subjectId].lastStudied)
                subjectStats[s.subjectId].lastStudied = d;
        }
    });

    const totalHours = (totalSeconds / 3600).toFixed(1);
    const totalSessions = AppState.sessions.length;

    // Study streak
    let streak = 0, maxStreak = 0, cur = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const studyDays = new Set(AppState.sessions.map(s => new Date(s.startTime).toDateString()));
    for (let i = 0; i < 365; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        if (studyDays.has(d.toDateString())) { cur++; if (i === 0 || i === 1) streak = cur; maxStreak = Math.max(maxStreak, cur); }
        else { if (i > 0) cur = 0; }
    }

    // Mock stats
    const mockCount = AppState.mockTests.length;
    const mockAvg = mockCount > 0
        ? (AppState.mockTests.reduce((a, m) => a + (m.score / (m.maxScore || 100)) * 100, 0) / mockCount).toFixed(1)
        : 'N/A';
    const mockBest = mockCount > 0
        ? Math.max(...AppState.mockTests.map(m => Math.round((m.score / (m.maxScore || 100)) * 100))) + '%'
        : 'N/A';

    // Practice stats
    const pArr = Array.isArray(AppState.questionPractice) ? AppState.questionPractice : [];
    const practiceAttempted = pArr.reduce((a, p) => a + (p.attempted || 0), 0);
    const practiceCorrect = pArr.reduce((a, p) => a + (p.correct || 0), 0);
    const practiceAccuracy = practiceAttempted > 0 ? Math.round((practiceCorrect / practiceAttempted) * 100) + '%' : 'N/A';

    // Workout stats
    const workoutQCount = AppState.workoutQuestions?.length || 0;
    const workoutDone = AppState.workoutStats?.totalDone || 0;

    // ── PDF Header ──────────────────────────────────────────────────
    let y = addPdfHeader(doc, 'Study Report — Lifetime', [41, 151, 255], 'AcademicPulse · Complete Study Analysis');

    // ── Summary Box ─────────────────────────────────────────────────
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text('Study Summary', 14, y + 6);
    y += 10;

    doc.autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: [
            ['Total Lifetime Study Hours', `${totalHours}h`],
            ['Total Study Sessions', `${totalSessions}`],
            ['Current Study Streak', `${streak} day${streak !== 1 ? 's' : ''}`],
            ['Longest Streak', `${maxStreak} day${maxStreak !== 1 ? 's' : ''}`],
            ['Mock Tests Taken', `${mockCount}`],
            ['Mock Exam Avg Score', `${mockAvg}${typeof mockAvg === 'string' && mockAvg !== 'N/A' ? '%' : ''}`],
            ['Mock Exam Best Score', `${mockBest}`],
            ['Question Practice Sessions', `${practiceAttempted} attempted, ${practiceAccuracy} accuracy`],
            ['Workout Bank Questions', `${workoutQCount} questions, ${workoutDone} workouts done`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [41, 151, 255] },
        styles: { fontSize: 10 }
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── Subject Breakdown ────────────────────────────────────────────
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text('Subject Breakdown', 14, y + 4);
    y += 8;

    const tableBody = Object.values(subjectStats).map(s => {
        const hrs = parseFloat((s.totalSeconds / 3600).toFixed(1));
        const weekHrs = s.weekSeconds / 3600;
        const target = s.targetHours || 0;
        const progress = target > 0 ? Math.min(100, Math.round((weekHrs / target) * 100)) + '%' : 'N/A';
        const last = s.lastStudied ? s.lastStudied.toLocaleDateString() : 'Never';
        return [s.name, s.course || 'CSEB', s.priority, `${hrs}h`, `${target}h/wk`, progress, `${s.sessions}`, last];
    });

    doc.autoTable({
        startY: y,
        head: [['Subject', 'Course', 'Priority', 'Total Hours', 'Weekly Target', 'Progress', 'Sessions', 'Last Studied']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 151, 255] },
        styles: { fontSize: 8.5 }
    });

    doc.save('Study_Report.pdf');
}

function generateMonthlyReport() {
    const doc = setupPDF();

    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthKey = TimeUtils.getMonthKey(now);

    let y = addPdfHeader(doc, `Monthly Report — ${monthName}`, [10, 132, 255], 'AcademicPulse · Month at a Glance');

    // ── Monthly Sessions ────────────────────────────────────────────
    let monthTotal = 0;
    const daysMap = {};
    const subjectMonthMap = {};

    AppState.sessions.forEach(s => {
        const d = new Date(s.startTime);
        if (TimeUtils.getMonthKey(d) === monthKey) {
            const dur = s.duration || (s.endTime ? (new Date(s.endTime) - d) / 1000 : 0);
            monthTotal += dur;
            const dateStr = d.toLocaleDateString();
            daysMap[dateStr] = (daysMap[dateStr] || 0) + dur;
            const subj = AppState.subjects.find(sub => sub.id === s.subjectId);
            const subjName = subj ? subj.name : 'Unknown';
            subjectMonthMap[subjName] = (subjectMonthMap[subjName] || 0) + dur;
        }
    });

    const monthHours = (monthTotal / 3600).toFixed(1);
    const studyDaysCount = Object.keys(daysMap).length;
    const avgPerDay = studyDaysCount > 0 ? ((monthTotal / 3600) / studyDaysCount).toFixed(1) : '0';

    // Attendance for this month
    let mPresent = 0, mAbsent = 0, mLeave = 0;
    Object.entries(AppState.attendance).forEach(([dk, status]) => {
        if (dk.startsWith(monthKey)) {
            if (status === 'present') mPresent++;
            else if (status === 'absent') mAbsent++;
            else if (status === 'leave') mLeave++;
        }
    });
    const mTotal = mPresent + mAbsent + mLeave;
    const mPct = mTotal > 0 ? Math.round((mPresent / mTotal) * 100) : 0;

    // ── Summary ─────────────────────────────────────────────────────
    doc.autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: [
            ['Total Hours This Month', `${monthHours}h`],
            ['Study Days', `${studyDaysCount}`],
            ['Avg Hours / Study Day', `${avgPerDay}h`],
            ['Attendance', `${mPct}% (Present: ${mPresent}, Absent: ${mAbsent}, Leave: ${mLeave})`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [10, 132, 255] },
        styles: { fontSize: 10 }
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── Per-Subject Hours this Month ────────────────────────────────
    if (Object.keys(subjectMonthMap).length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.text('Hours by Subject this Month', 14, y + 4);
        y += 8;

        const subjRows = Object.entries(subjectMonthMap)
            .sort((a, b) => b[1] - a[1])
            .map(([name, secs]) => {
                const hrs = parseFloat((secs / 3600).toFixed(1));
                const pct = monthTotal > 0 ? Math.round((secs / monthTotal) * 100) + '%' : '0%';
                return [name, `${hrs}h`, pct];
            });

        doc.autoTable({
            startY: y,
            head: [['Subject', 'Hours', '% of Month']],
            body: subjRows,
            theme: 'striped',
            headStyles: { fillColor: [10, 132, 255] },
            styles: { fontSize: 10 }
        });

        y = doc.lastAutoTable.finalY + 10;
    }

    // ── Daily Breakdown ─────────────────────────────────────────────
    const sortedDays = Object.keys(daysMap).sort((a, b) => new Date(a) - new Date(b));
    if (sortedDays.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.text('Daily Breakdown', 14, y + 4);
        y += 8;

        doc.autoTable({
            startY: y,
            head: [['Date', 'Time Studied', 'Attendance']],
            body: sortedDays.map(dateStr => {
                const hrs = Math.floor(daysMap[dateStr] / 3600);
                const mins = Math.floor((daysMap[dateStr] % 3600) / 60);
                const dk = dateStr.split('/').reverse().join('-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, m, d) => `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
                const att = AppState.attendance[dk] || 'Not Marked';
                return [dateStr, `${hrs}h ${mins}m`, att.charAt(0).toUpperCase() + att.slice(1)];
            }),
            theme: 'grid',
            headStyles: { fillColor: [10, 132, 255] },
            styles: { fontSize: 9 }
        });
    }

    doc.save(`Monthly_Report_${monthName.replace(' ', '_')}.pdf`);
}

function generateAttendanceReport() {
    const doc = setupPDF();

    let y = addPdfHeader(doc, 'Attendance Report', [48, 209, 88], 'AcademicPulse · Full Attendance Analysis');

    let present = 0, absent = 0, leave = 0;
    const dates = Object.keys(AppState.attendance).sort();

    dates.forEach(dKey => {
        const status = AppState.attendance[dKey];
        if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else if (status === 'leave') leave++;
    });

    const totalMarked = present + absent + leave;
    const pct = totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0;

    // Cross-reference: study hours on present days
    const sessionsByDay = {};
    AppState.sessions.forEach(s => {
        const dk = typeof TimeUtils.getDateKey === 'function' ? TimeUtils.getDateKey(new Date(s.startTime)) : new Date(s.startTime).toISOString().split('T')[0];
        const dur = s.duration || (s.endTime ? (new Date(s.endTime) - new Date(s.startTime)) / 1000 : 0);
        sessionsByDay[dk] = (sessionsByDay[dk] || 0) + dur;
    });

    const totalStudyHoursOnPresentDays = dates
        .filter(d => AppState.attendance[d] === 'present')
        .reduce((a, d) => a + (sessionsByDay[d] || 0), 0);

    // ── Summary ─────────────────────────────────────────────────────
    doc.autoTable({
        startY: y,
        head: [['Metric', 'Value']],
        body: [
            ['Attendance Percentage', `${pct}%`],
            ['Present Days', `${present}`],
            ['Absent Days', `${absent}`],
            ['Leave Days', `${leave}`],
            ['Total Marked Days', `${totalMarked}`],
            ['Study Hours on Present Days', `${(totalStudyHoursOnPresentDays / 3600).toFixed(1)}h`],
            ['Avg Study Hours / Present Day', present > 0 ? `${(totalStudyHoursOnPresentDays / 3600 / present).toFixed(1)}h` : 'N/A'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [48, 209, 88] },
        styles: { fontSize: 10 }
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── Weekly Breakdown ─────────────────────────────────────────────
    const weekMap = {};
    dates.forEach(dKey => {
        const [y, m, day] = dKey.split('-');
        const d = new Date(y, m - 1, day);
        d.setHours(0, 0, 0, 0);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const wk = weekStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        if (!weekMap[wk]) weekMap[wk] = { present: 0, absent: 0, leave: 0, studySecs: 0 };
        const status = AppState.attendance[dKey];
        if (status === 'present') { weekMap[wk].present++; weekMap[wk].studySecs += (sessionsByDay[dKey] || 0); }
        else if (status === 'absent') weekMap[wk].absent++;
        else if (status === 'leave') weekMap[wk].leave++;
    });

    const weekRows = Object.entries(weekMap).map(([wk, v]) => {
        const hrs = (v.studySecs / 3600).toFixed(1);
        return [wk, `${v.present}`, `${v.absent}`, `${v.leave}`, `${hrs}h`];
    });

    if (weekRows.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.text('Weekly Breakdown', 14, y + 4);
        y += 8;

        doc.autoTable({
            startY: y,
            head: [['Week Starting', 'Present', 'Absent', 'Leave', 'Study Hours']],
            body: weekRows,
            theme: 'striped',
            headStyles: { fillColor: [48, 209, 88] },
            styles: { fontSize: 9 }
        });

        y = doc.lastAutoTable.finalY + 10;
    }

    // ── Full Day Log ─────────────────────────────────────────────────
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text('Full Day Log', 14, y + 4);
    y += 8;

    const tableBody = dates.map(dKey => {
        const status = AppState.attendance[dKey];
        const studyHrs = sessionsByDay[dKey] ? ((sessionsByDay[dKey] / 3600).toFixed(1) + 'h') : '-';
        return [dKey, status.charAt(0).toUpperCase() + status.slice(1), studyHrs];
    });

    doc.autoTable({
        startY: y,
        head: [['Date', 'Status', 'Study Hours']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [48, 209, 88] },
        styles: { fontSize: 9 },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 1) {
                if (data.cell.raw === 'Present') data.cell.styles.textColor = [48, 209, 88];
                if (data.cell.raw === 'Absent') data.cell.styles.textColor = [255, 69, 58];
                if (data.cell.raw === 'Leave') data.cell.styles.textColor = [255, 159, 10];
            }
        }
    });

    doc.save('Attendance_Report.pdf');
}
