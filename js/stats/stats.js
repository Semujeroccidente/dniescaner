/**
 * Statistics Module
 * Visualizes data from AgendaDB and DNI_Scanner_DB using Chart.js
 */

class StatsApp {
    constructor() {
        this.data = {
            appointments: [],
            staff: [],
            records: []
        };

        // Colors from specific palette
        this.colors = {
            primary: '#667eea',
            secondary: '#764ba2',
            success: '#48bb78',
            warning: '#ed8936',
            info: '#4299e1',
            palette: [
                '#667eea', '#764ba2', '#48bb78', '#ed8936', '#4299e1',
                '#f56565', '#9f7aea', '#38b2ac', '#d69e2e', '#e53e3e'
            ]
        };

        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.updateKPIs();
            this.renderCharts();
        } catch (error) {
            console.error("Stats Init Error:", error);
        }
    }

    async loadData() {
        try {
            const [appointments, staff, records] = await Promise.all([
                this.getAllFromStore('AgendaDB', 'appointments', 2),
                this.getAllFromStore('AgendaDB', 'staff', 2),
                this.getAllFromStore('DNI_Scanner_DB', 'records', 1)
            ]);

            this.data.appointments = appointments;
            this.data.staff = staff;
            this.data.records = records;

        } catch (e) {
            console.warn("Could not load all data", e);
        }
    }

    updateKPIs() {
        // Unique Beneficiaries (Count unique DNIs)
        const uniqueDNIs = new Set(this.data.records.map(r => r.dni));
        this.animateValue('kpi-beneficiaries', uniqueDNIs.size);

        // Total Appointments
        this.animateValue('kpi-appointments', this.data.appointments.length);

        // Total Scans
        this.animateValue('kpi-scans', this.data.records.length);

        // Active Staff
        this.animateValue('kpi-staff', this.data.staff.length);
    }

    renderCharts() {
        this.renderAppointmentsTrend();
        this.renderAgeDistribution();
        this.renderGeoDistribution();
        this.renderStaffWorkload();
    }

    renderAppointmentsTrend() {
        const ctx = document.getElementById('chart-appointments').getContext('2d');
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        // Aggregate by Month (Current Year 2025 default)
        const currentYear = 2025; // Ideally dynamic
        const counts = new Array(12).fill(0);

        this.data.appointments.forEach(appt => {
            const date = new Date(appt.date); // "YYYY-MM-DD"
            // Note: date.getMonth() is 0-indexed, but parsing date string might use local time.
            // Safe parse:
            if (date.getFullYear() === currentYear) {
                counts[date.getMonth()]++;
            }
        });

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: `Citas ${currentYear}`,
                    data: counts,
                    borderColor: this.colors.primary,
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: this.colors.primary,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f7fafc' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    renderAgeDistribution() {
        const ctx = document.getElementById('chart-ages').getContext('2d');

        // Buckets: 18-25, 26-35, 36-45, 46-60, 60+
        const buckets = { '18-25': 0, '26-35': 0, '36-45': 0, '46-60': 0, '60+': 0 };

        this.data.records.forEach(r => {
            const age = parseInt(r.age);
            if (!age) return;

            if (age >= 18 && age <= 25) buckets['18-25']++;
            else if (age >= 26 && age <= 35) buckets['26-35']++;
            else if (age >= 36 && age <= 45) buckets['36-45']++;
            else if (age >= 46 && age <= 60) buckets['46-60']++;
            else if (age > 60) buckets['60+']++;
        });

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(buckets),
                datasets: [{
                    label: 'Beneficiarias',
                    data: Object.values(buckets),
                    backgroundColor: [
                        '#667eea', '#764ba2', '#9f7aea', '#b794f4', '#d6bcfa'
                    ],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
            }
        });
    }

    renderGeoDistribution() {
        const ctx = document.getElementById('chart-geo').getContext('2d');

        // Count by Department or Municipality
        // Let's use Municipality if available, else Department
        // Limiting to Top 5 + Others
        const geoCount = {};

        this.data.records.forEach(r => {
            const loc = r.municipality || r.department || 'Desconocido';
            // Normalize
            const key = loc === 'NO DEFINIDO' ? 'Desconocido' : loc;
            geoCount[key] = (geoCount[key] || 0) + 1;
        });

        const sorted = Object.entries(geoCount).sort((a, b) => b[1] - a[1]);
        const top5 = sorted.slice(0, 5);
        const othersCount = sorted.slice(5).reduce((sum, item) => sum + item[1], 0);

        if (othersCount > 0) top5.push(['Otros', othersCount]);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: top5.map(i => i[0]),
                datasets: [{
                    data: top5.map(i => i[1]),
                    backgroundColor: this.colors.palette,
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12 } }
                },
                cutout: '70%'
            }
        });
    }

    renderStaffWorkload() {
        const ctx = document.getElementById('chart-staff').getContext('2d');

        const staffCount = {};

        // Init staff with 0
        this.data.staff.forEach(s => staffCount[s.role] = 0);

        // Check assigned staff in appointments
        this.data.appointments.forEach(appt => {
            if (appt.staff && Array.isArray(appt.staff)) {
                appt.staff.forEach(role => {
                    staffCount[role] = (staffCount[role] || 0) + 1;
                });
            }
        });

        // Sort by workload
        const sorted = Object.entries(staffCount).sort((a, b) => b[1] - a[1]);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(i => i[0]),
                datasets: [{
                    label: 'Citas Asignadas',
                    data: sorted.map(i => i[1]),
                    backgroundColor: this.colors.success,
                    borderRadius: 50,
                    barThickness: 20
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal Bar
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });
    }

    // Helper: Fetch IDB
    getAllFromStore(dbName, storeName, version) {
        return new Promise((resolve) => {
            const req = indexedDB.open(dbName, version);
            req.onerror = () => resolve([]);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    resolve([]);
                    return;
                }
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getReq = store.getAll();
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => resolve([]);
            };
        });
    }

    // Helper: Number Animation
    animateValue(id, value) {
        const obj = document.getElementById(id);
        if (!obj) return;

        const duration = 1000;
        const start = 0;
        let startTime = null;

        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            obj.innerHTML = Math.floor(progress * (value - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerHTML = value;
            }
        };
        window.requestAnimationFrame(step);
    }
}

// Init
const statsApp = new StatsApp();
