/**
 * Reports Generator for Agenda Module
 * Uses jsPDF and jspdf-autotable to create official PDF reports.
 */

class AgendaReports {
    constructor() {
        this.init();
    }

    init() {
        // Wait for DOM to be ready to attach listeners
        document.addEventListener('DOMContentLoaded', () => {
            const btnExport = document.getElementById('btn-export-pdf');
            if (btnExport) {
                btnExport.addEventListener('click', () => this.generateReport());
            }
        });
    }

    async generateReport() {
        // Check if jsPDF is loaded
        if (!window.jspdf || !window.jspdf.jsPDF) {
            console.error('jsPDF library not loaded');
            this.showToast('Error: Librería PDF no cargada', 'error');
            return;
        }

        try {
            this.showToast('Generando reporte...', 'success');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // --- Header ---
            // Institutional colors
            const primaryColor = [102, 126, 234]; // #667eea

            // Title
            doc.setFontSize(22);
            doc.setTextColor(45, 55, 72); // Dark grey
            doc.setFont("helvetica", "bold");
            doc.text("Agenda Regional - SEMUJER", 14, 20);

            // Subtitle / Date
            doc.setFontSize(12);
            doc.setTextColor(113, 128, 150);
            doc.setFont("helvetica", "normal");
            const today = new Date().toLocaleDateString('es-HN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            doc.text(`Reporte generado el: ${today}`, 14, 28);

            // Line separator
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(1);
            doc.line(14, 32, 196, 32);

            // --- Data fetching ---
            // We need to get the appointments currently visible or stored.
            // Since agenda.js handles state, we can try to access the DB directly or use a global if available.
            // For now, let's fetch ALL appointments from IndexedDB to ensure we have data.
            // ideally we would filter based on the current view, but a full report is safer as a start.

            const appointments = await this.getAllAppointments();

            if (appointments.length === 0) {
                this.showToast('No hay citas para exportar', 'error');
                return;
            }

            // Prepare Table Data
            // headers: ['Fecha', 'Hora', 'Evento', 'Responsable', 'Estado']
            const tableBody = appointments.map(appt => [
                this.formatDate(appt.date),
                this.formatTime(appt.time),
                appt.title,
                appt.staff.join(', '), // Staff array to string
                'Programada' // Placeholder status
            ]);

            // Sort by Date then Time
            tableBody.sort((a, b) => {
                // simple string compare for date YYYY-MM-DD
                if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
                return a[1].localeCompare(b[1]);
            });

            // --- Table Generation ---
            doc.autoTable({
                startY: 40,
                head: [['Fecha', 'Hora', 'Evento', 'Personal Asignado', 'Estado']],
                body: tableBody,
                theme: 'grid',
                headStyles: {
                    fillColor: primaryColor,
                    textColor: 255,
                    fontSize: 10,
                    fontStyle: 'bold'
                },
                styles: {
                    fontSize: 9,
                    cellPadding: 3,
                    overflow: 'linebreak'
                },
                columnStyles: {
                    0: { cellWidth: 25 }, // Fecha
                    1: { cellWidth: 20 }, // Hora
                    2: { cellWidth: 'auto' }, // Evento (auto expand)
                    3: { cellWidth: 50 }, // Personal
                    4: { cellWidth: 25 } // Estado
                },
                alternateRowStyles: {
                    fillColor: [247, 250, 252]
                }
            });

            // --- Footer ---
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Página ${i} de ${pageCount}`, 196, 285, { align: 'right' });
            }

            // Save
            doc.save(`Reporte_Agenda_${new Date().toISOString().split('T')[0]}.pdf`);
            this.showToast('Reporte descargado con éxito', 'success');

        } catch (error) {
            console.error("Error generating PDF:", error);
            this.showToast('Error al generar el PDF', 'error');
        }
    }

    // Helper: Fetch all from IDB
    getAllAppointments() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("AgendaDB", 1);

            request.onerror = (event) => reject("DB Error");

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(["appointments"], "readonly");
                const store = transaction.objectStore("appointments");
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = () => resolve(getAllRequest.result);
                getAllRequest.onerror = () => reject("Fetch Error");
            };
        });
    }

    // Helper: Toast
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} show`;
        toast.innerHTML = `
            <i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'circle-exclamation'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);

        // Remove after 3s
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Helper: Formatters
    formatDate(dateStr) {
        // Input: "2025-12-08" to "08/12/2025"
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    formatTime(timeStr) {
        // Already AM/PM formatted in DB? usually formatted string
        // If it's 24h, convert. Assuming string for now.
        return timeStr || '';
    }
}

// Initialize
const reportsApp = new AgendaReports();
