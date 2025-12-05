// Dashboard Statistics Manager
const DashboardStats = {
    charts: {},
    chartColors: {
        primary: '#667eea',
        secondary: '#f093fb',
        success: '#43e97b',
        warning: '#fa709a',
        danger: '#f85032',
        accent: '#4facfe',
        light: '#e8ecf1'
    },

    init: async () => {
        const records = await dbManager.getAllRecords();
        DashboardStats.updateStats(records);
        DashboardStats.renderCharts(records);

        // If no records, hide chart grid to avoid empty canvas display
        const chartGrid = document.querySelector('.charts-grid');
        const statsSection = document.getElementById('dashboard-section');
        if (chartGrid) {
            // If placeholder exists (no data), clear it to rebuild chart canvases
            const placeholder = chartGrid.querySelector('.chart-placeholder');
            if (placeholder) chartGrid.innerHTML = '';
            if (records && records.length) {
                chartGrid.style.display = '';
            } else {
                chartGrid.style.display = 'grid';
                chartGrid.innerHTML = `<div class="chart-placeholder" style="padding:1rem; text-align:center; color:var(--gray-700);">No hay datos para mostrar.</div>`;
            }
        }
        if (statsSection) statsSection.style.display = (records && records.length) ? '' : '';
    },

    updateStats: (records) => {
        const totalRegistrosEl = document.getElementById('total-registros');
        const edadPromedioEl = document.getElementById('edad-promedio');
        const edadMinEl = document.getElementById('edad-min');
        const edadMaxEl = document.getElementById('edad-max');

        // Si no existen los elementos del dashboard, salir silenciosamente
        if (!totalRegistrosEl || !edadPromedioEl || !edadMinEl || !edadMaxEl) {
            console.warn('Dashboard statistics elements not found in HTML');
            return;
        }

        if (!records.length) {
            totalRegistrosEl.textContent = '0';
            edadPromedioEl.textContent = '0';
            edadMinEl.textContent = '0';
            edadMaxEl.textContent = '0';
            return;
        }

        // Total records
        totalRegistrosEl.textContent = records.length;

        // Calculate ages
        const ages = records
            .map(r => {
                if (r.age && !isNaN(parseInt(r.age))) {
                    return parseInt(r.age);
                }
                return null;
            })
            .filter(age => age !== null);

        if (ages.length > 0) {
            const average = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
            const min = Math.min(...ages);
            const max = Math.max(...ages);

            edadPromedioEl.textContent = average;
            edadMinEl.textContent = min;
            edadMaxEl.textContent = max;
        }
    },

    renderCharts: (records) => {
        if (!records.length) return;

        // Destroy existing charts
        Object.values(DashboardStats.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        DashboardStats.charts = {};

        // Ensure canvases exist (in case charts-grid was cleared for 'no data')
        const chartGrid = document.querySelector('.charts-grid');
        if (chartGrid) {
            // Recreate canvases if missing
            const ensureCanvas = (id, title) => {
                if (!document.getElementById(id)) {
                    const div = document.createElement('div');
                    div.className = 'chart-container';
                    div.innerHTML = `<h4>${title}</h4><canvas id="${id}"></canvas>`;
                    chartGrid.appendChild(div);
                }
            };
            ensureCanvas('chart-gender', 'Distribución por Sexo');
            ensureCanvas('chart-age', 'Distribución por Edad');
            ensureCanvas('chart-department', 'Top Departamentos');
            ensureCanvas('chart-municipality', 'Top Municipios');
        }

        // Gender Distribution
        DashboardStats.renderGenderChart(records);

        // Age Distribution
        DashboardStats.renderAgeChart(records);

        // Department Distribution
        DashboardStats.renderDepartmentChart(records);

        // Municipality Distribution
        DashboardStats.renderMunicipalityChart(records);
    },

    renderGenderChart: (records) => {
        const genderData = { M: 0, F: 0, Otro: 0 };
        records.forEach(r => {
            if (r.gender === 'M') genderData.M++;
            else if (r.gender === 'F') genderData.F++;
            else genderData.Otro++;
        });

        const ctx = document.getElementById('chart-gender')?.getContext('2d');
        if (!ctx) return;

        DashboardStats.charts.gender = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Masculino', 'Femenino', 'Otro'],
                datasets: [{
                    data: [genderData.M, genderData.F, genderData.Otro],
                    backgroundColor: [
                        '#4facfe',
                        '#fa709a',
                        '#f5a623'
                    ],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
                options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { size: 12, weight: 'bold' },
                            color: '#4a5468',
                            padding: 15
                        }
                    }
                }
            }
        });
    },

    renderAgeChart: (records) => {
        const ageRanges = {
            '0-17': 0,
            '18-29': 0,
            '30-59': 0,
            '60+': 0
        };

        records.forEach(r => {
            if (r.age) {
                const age = parseInt(r.age);
                if (age <= 17) ageRanges['0-17']++;
                else if (age <= 29) ageRanges['18-29']++;
                else if (age <= 59) ageRanges['30-59']++;
                else ageRanges['60+']++;
            }
        });

        const ctx = document.getElementById('chart-age')?.getContext('2d');
        if (!ctx) return;

        DashboardStats.charts.age = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(ageRanges),
                datasets: [{
                    label: 'Cantidad de Registros',
                    data: Object.values(ageRanges),
                    backgroundColor: [
                        '#43e97b',
                        '#4facfe',
                        '#f5a623',
                        '#f85032'
                    ],
                    borderRadius: 5,
                    borderSkipped: false
                }]
            },
                options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'x',
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: {
                        labels: { font: { size: 12, weight: 'bold' }, color: '#4a5468' }
                    }
                }
            }
        });
    },

    renderDepartmentChart: (records) => {
        const deptData = {};
        records.forEach(r => {
            if (r.department) {
                deptData[r.department] = (deptData[r.department] || 0) + 1;
            }
        });

        // Sort and get top 8
        const sorted = Object.entries(deptData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        const ctx = document.getElementById('chart-department')?.getContext('2d');
        if (!ctx) return;

        DashboardStats.charts.department = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d[0]),
                datasets: [{
                    label: 'Registros',
                    data: sorted.map(d => d[1]),
                    backgroundColor: '#667eea',
                    borderRadius: 5,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'x',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    },

    renderMunicipalityChart: (records) => {
        const muniData = {};
        records.forEach(r => {
            if (r.municipality) {
                muniData[r.municipality] = (muniData[r.municipality] || 0) + 1;
            }
        });

        // Sort and get top 10
        const sorted = Object.entries(muniData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const ctx = document.getElementById('chart-municipality')?.getContext('2d');
        if (!ctx) return;

        DashboardStats.charts.municipality = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(m => m[0]),
                datasets: [{
                    label: 'Registros',
                    data: sorted.map(m => m[1]),
                    backgroundColor: '#f093fb',
                    borderRadius: 5,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
};
