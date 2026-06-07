window.addEventListener('DOMContentLoaded', () => {
    // Give time for UI to initialize
    setTimeout(() => {
        const btnStudy = document.getElementById('btnExportStudy');
        const btnMonthly = document.getElementById('btnExportMonthly');
        const btnAttendance = document.getElementById('btnExportAttendance');

        if (btnStudy) btnStudy.addEventListener('click', generateStudyReport);
        if (btnMonthly) btnMonthly.addEventListener('click', generateMonthlyReport);
        if (btnAttendance) btnAttendance.addEventListener('click', generateAttendanceReport);
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
        totalSeconds += s.duration;
        if (subjectStats[s.subjectId]) {
            subjectStats[s.subjectId].totalSeconds += s.duration;
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
            monthTotal += s.duration;
            const dateStr = d.toLocaleDateString();
            daysMap[dateStr] = (daysMap[dateStr] || 0) + s.duration;
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
