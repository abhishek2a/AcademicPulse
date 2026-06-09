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
        // Load jsPDF first (autotable depends on it), then load autotable and pdf.js in parallel
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
    // Give time for UI to initialize
    setTimeout(() => {
        const btnStudy = document.getElementById('btnExportStudy');
        const btnMonthly = document.getElementById('btnExportMonthly');
        const btnAttendance = document.getElementById('btnExportAttendance');

        if (btnStudy) btnStudy.addEventListener('click', async () => { await loadPdfLibraries(); generateStudyReport(); });
        if (btnMonthly) btnMonthly.addEventListener('click', async () => { await loadPdfLibraries(); generateMonthlyReport(); });
        if (btnAttendance) btnAttendance.addEventListener('click', async () => { await loadPdfLibraries(); generateAttendanceReport(); });
    }, 500);
});

// Utility to configure basic PDF styling
function setupPDF() {
    const doc = new window.jspdf.jsPDF();
    doc.setFont("helvetica");
    return doc;
}

function generateStudyReport() {
    const doc = setupPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(41, 151, 255); // Neon Blue
    doc.text("Study Tracker - Lifetime Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    // Calculate totals
    let totalSeconds = 0;
    const subjectStats = {};
    AppState.subjects.forEach(s => {
        subjectStats[s.id] = { name: s.name, course: s.course, priority: s.priority, totalSeconds: 0, targetHours: s.targetHours };
    });

    AppState.sessions.forEach(s => {
        // Use duration field with fallback to startTime/endTime calculation to avoid NaN
        const dur = s.duration || (s.endTime ? (new Date(s.endTime) - new Date(s.startTime)) / 1000 : 0);
        totalSeconds += dur;
        if (subjectStats[s.subjectId]) {
            subjectStats[s.subjectId].totalSeconds += dur;
        }
    });

    const totalHours = (totalSeconds / 3600).toFixed(1);
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text(`Total Lifetime Study Hours: ${totalHours}h`, 14, 45);

    // Table Data
    const tableBody = Object.values(subjectStats).map(s => {
        const hrs = (s.totalSeconds / 3600).toFixed(1);
        const target = s.targetHours || 0;
        const progress = target > 0 ? Math.round((hrs / target) * 100) + '%' : 'N/A';
        return [
            s.name,
            s.course || 'CSEB',
            s.priority,
            `${hrs}h`,
            `${target}h / week`,
            progress
        ];
    });

    // AutoTable
    doc.autoTable({
        startY: 55,
        head: [['Subject', 'Course', 'Priority', 'Studied', 'Weekly Target', 'Progress']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 151, 255] },
        styles: { fontSize: 10 }
    });

    doc.save('Study_Report.pdf');
}

function generateMonthlyReport() {
    const doc = setupPDF();
    
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    doc.setFontSize(22);
    doc.setTextColor(10, 132, 255);
    doc.text(`Monthly Study Report - ${monthName}`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const monthKey = TimeUtils.getMonthKey(now);
    let monthTotal = 0;
    const daysMap = {};

    AppState.sessions.forEach(s => {
        const d = new Date(s.startTime);
        if (TimeUtils.getMonthKey(d) === monthKey) {
            // Use duration field with fallback to startTime/endTime calculation to avoid NaN
            const dur = s.duration || (s.endTime ? (new Date(s.endTime) - d) / 1000 : 0);
            monthTotal += dur;
            const dateStr = d.toLocaleDateString();
            daysMap[dateStr] = (daysMap[dateStr] || 0) + dur;
        }
    });

    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text(`Total Hours this Month: ${(monthTotal / 3600).toFixed(1)}h`, 14, 45);
    
    // Sort days chronologically
    const sortedDays = Object.keys(daysMap).sort((a,b) => new Date(a) - new Date(b));
    const tableBody = sortedDays.map(dateStr => {
        const hrs = Math.floor(daysMap[dateStr] / 3600);
        const mins = Math.floor((daysMap[dateStr] % 3600) / 60);
        return [dateStr, `${hrs}h ${mins}m`];
    });

    doc.autoTable({
        startY: 55,
        head: [['Date', 'Time Studied']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [10, 132, 255] }
    });

    doc.save(`Monthly_Report_${monthName.replace(' ', '_')}.pdf`);
}

function generateAttendanceReport() {
    const doc = setupPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(48, 209, 88); // Neon Green
    doc.text("Attendance Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    let present = 0;
    let absent = 0;
    let leave = 0;
    
    // Sort dates
    const dates = Object.keys(AppState.attendance).sort();
    
    const tableBody = dates.map(dKey => {
        const status = AppState.attendance[dKey];
        if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else if (status === 'leave') leave++;
        
        return [dKey, status.charAt(0).toUpperCase() + status.slice(1)];
    });

    const totalMarked = present + absent + leave;
    const pct = totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0;

    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text(`Attendance Percentage: ${pct}%`, 14, 45);
    doc.setFontSize(12);
    doc.text(`Present: ${present} | Absent: ${absent} | Leave: ${leave}`, 14, 55);

    doc.autoTable({
        startY: 65,
        head: [['Date', 'Status']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [48, 209, 88] },
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
