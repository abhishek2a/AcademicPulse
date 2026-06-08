# AcademicPulse 🚀

AcademicPulse is a sleek, glassmorphic Progressive Web App (PWA) designed for professional and academic students to track study analytics, maintain consistency, and gauge exam readiness. It features localized pipelines for tracking specialized courses like the Co-operative Service Examination Board (**CSEB**) and the Association of Chartered Certified Accountants (**ACCA**).

Built using vanilla modern web technologies and structured for seamless performance, it leverages dynamically loaded modules for heavy lifting (charts, document parsing, analytics engines) and features real-time data persistence.

---

## ✨ Features

- **Advanced Dashboard & Goals:** Real-time logging metrics showing daily/weekly/monthly target streaks and a historical logging table.
- **Syllabus & Course Management:** Dynamic sub-view layers tracking specific areas of standard syllabi across multi-course operations (CSEB & ACCA).
- **Attendance & Day Reporting Engine:** Integrated visual interactive calendar showing active streaks, monthly metrics, and detailed granular daily logs.
- **Exam Readiness & AI Recommendations:** Customized mock test logger alongside predictive metric components evaluating topic-by-topic analytics.
- **Report Analyzer:** Clientside drag-and-drop workflow that securely processes and evaluates exported data from native application PDFs.
- **Global Context Search Engine:** Fast filtering lookup system across sessions, mock scores, and courses.
- **Cross-Platform PWA Capabilities:** Offline application capabilities, installable interface badges, service-worker ready, optimized for Apple/Android platforms.

---

## 🛠️ Architecture & Tech Stack

- **Frontend Architecture:** Clean HTML5 Semantic Markup paired with a highly custom CSS Custom Property engine supporting native system-level Light/Dark theme overrides.
- **Backend Infrastructure:** Firebase Core Compatibility SDK layer managed via:
  - `firebase-auth-compat.js` (Secure User Access Token verification)
  - `firebase-firestore-compat.js` (Dynamic real-time cloud data indexing)
- **Lazy-Loaded High-Performance Libraries:** Heavy processing libraries are injected *on-demand* to optimize initial bundle payloads:
  - **Chart.js** (Renders performance matrices, trend curves, and donut charts)
  - **jsPDF** & **pdf.js** (Manages clientside PDF ingestion, extraction, and formatting)

---

## 📁 Repository Structure

```text
├── index.html           # Main SPA layout structure & application view modals
├── app.js               # Application core state controller and analytics engine
├── auth.js              # Authentication hooks and Firebase instance routers
├── export.js            # Engine handling raw PDF document exports
├── style.css            # Custom CSS Glassmorphic design engine 
├── manifest.json        # Web PWA manifest settings
└── icon.svg             # Application scalable resource assets
