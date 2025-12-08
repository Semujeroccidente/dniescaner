/**
 * Directory Module Logic
 * Aggregates DNI scans and Agenda appointments into unique profiles.
 */

class DirectoryApp {
    constructor() {
        this.profiles = new Map(); // DNI -> Profile Object
        this.records = [];
        this.appointments = [];

        this.dbNameDNI = 'DNI_Scanner_DB';
        this.dbNameAgenda = 'AgendaDB';

        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.processProfiles();
            this.renderGrid(Array.from(this.profiles.values()));
            this.attachEvents();
        } catch (error) {
            console.error("Initialization Error:", error);
            document.querySelector('.loading-state').innerHTML = '<p style="color:red">Error cargando directorio.</p>';
        }
    }

    async loadData() {
        // Parallel Fetch from both DBs
        const [records, appointments] = await Promise.all([
            this.fetchAll(this.dbNameDNI, 'records'),
            this.fetchAll(this.dbNameAgenda, 'appointments')
        ]);

        this.records = records;
        this.appointments = appointments;
    }

    fetchAll(dbName, storeName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onerror = () => {
                console.warn(`Could not open DB: ${dbName} (might not exist yet)`);
                resolve([]); // Return empty if DB doesn't exist
            };
            request.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    resolve([]);
                    return;
                }
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getAll = store.getAll();
                getAll.onsuccess = () => resolve(getAll.result);
                getAll.onerror = () => reject(getAll.error);
            };
        });
    }

    processProfiles() {
        // Group Records by DNI to form profiles
        this.records.forEach(record => {
            if (!record.dni) return;

            const dni = record.dni;

            if (!this.profiles.has(dni)) {
                // Create new profile
                this.profiles.set(dni, {
                    dni: dni,
                    fullname: record.fullname,
                    phone: record.phone || 'No registrado',
                    department: record.department,
                    age: record.age,
                    imageFront: record.imageFront, // Keeping latest image
                    scanHistory: [],
                    appointments: []
                });
            }

            // Add to history
            const profile = this.profiles.get(dni);
            profile.scanHistory.push(record);

            // Update with latest info if newer
            const recordDate = new Date(record.date);
            const currentLatest = profile.scanHistory[profile.scanHistory.length - 2]; // Previous latest
            if (!currentLatest || recordDate > new Date(currentLatest.date)) {
                profile.fullname = record.fullname;
                profile.imageFront = record.imageFront || profile.imageFront;
                profile.phone = record.phone || profile.phone;
            }
        });

        // Link Appointments (Fuzzy Match by Name)
        // Note: Linking by Name is risky, but we don't store DNI in appointments yet.
        // Ideally, Agenda should look up DNI. For now, we match roughly.
        this.appointments.forEach(appt => {
            // Check descriptions or titles for names (Primitive match)
            // Or if you had a 'clientName' field. Agenda currently stores 'title' and 'description'.
            // Assuming 'title' might be "Cita con [Name]" or we search profiles to see if their name is in title.

            // For this demo, let's try to match Profile Name inside Appointment Title
            this.profiles.forEach(profile => {
                if (appt.title && appt.title.toLowerCase().includes(profile.fullname.toLowerCase())) {
                    profile.appointments.push(appt);
                }
            });
        });
    }

    renderGrid(profiles) {
        const grid = document.getElementById('directory-grid');
        grid.innerHTML = '';

        if (profiles.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #718096;">
                    <i class="fa-solid fa-users-slash fa-2x"></i>
                    <p style="margin-top: 10px;">No se encontraron beneficiarias.</p>
                </div>
            `;
            return;
        }

        profiles.forEach(profile => {
            const card = document.createElement('div');
            card.className = 'profile-card';
            card.onclick = () => this.openProfile(profile);

            // Safe Image
            const imgParams = profile.imageFront ? `src="${profile.imageFront}"` : 'src="../assets/placeholder_user.png" style="padding: 10px; background: #eee;"';

            card.innerHTML = `
                <div class="card-header-img"></div>
                <img ${imgParams} class="profile-avatar" alt="Foto">
                
                <div class="card-body">
                    <h3 class="card-name" title="${profile.fullname}">${profile.fullname}</h3>
                    <span class="card-dni">${profile.dni}</span>
                    
                    <div class="card-stats">
                        <div class="stat-item">
                            <span class="stat-value">${profile.scanHistory.length}</span>
                            <span class="stat-label">Visitas</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${profile.appointments.length}</span>
                            <span class="stat-label">Citas</span>
                        </div>
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });
    }

    openProfile(profile) {
        // Populate Sidebar
        document.getElementById('modal-name').textContent = profile.fullname;
        document.getElementById('modal-dni').textContent = profile.dni;
        document.getElementById('modal-location').textContent = profile.department || 'Sin ubicación';
        document.getElementById('modal-phone').textContent = profile.phone || 'No registrado';
        document.getElementById('modal-age').textContent = profile.age ? `${profile.age} años` : '--';

        const avatar = document.getElementById('modal-avatar');
        if (profile.imageFront) {
            avatar.src = profile.imageFront;
        } else {
            // fallback
            avatar.src = 'data:image/svg+xml;base64,...'; // Better to use a real asset path or a generated SVG
            avatar.style.background = '#eee';
        }

        // Populate Scan History
        const scanList = document.getElementById('scan-history-list');
        scanList.innerHTML = '';
        profile.scanHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(scan => {
            const date = new Date(scan.date).toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-icon"><i class="fa-solid fa-id-card"></i></div>
                <div>
                    <h4 style="margin:0; font-size: 0.95rem; color: #2d3748;">Escaneo de Identidad</h4>
                    <span style="font-size: 0.8rem; color: #718096;">${date} &bull; ${scan.municipality || ''}</span>
                </div>
            `;
            scanList.appendChild(item);
        });

        // Populate Agenda History
        const agendaList = document.getElementById('agenda-history-list');
        agendaList.innerHTML = '';
        if (profile.appointments.length === 0) {
            agendaList.innerHTML = '<p style="text-align:center; color: #a0aec0; padding: 20px;">No se encontraron citas vinculadas.</p>';
        } else {
            profile.appointments.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(appt => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div class="history-icon" style="background:#fff5f7; color:#d53f8c;"><i class="fa-solid fa-calendar-check"></i></div>
                    <div>
                        <h4 style="margin:0; font-size: 0.95rem; color: #2d3748;">${appt.title}</h4>
                        <span style="font-size: 0.8rem; color: #718096;">${appt.date} ${appt.time} &bull; ${appt.staff ? appt.staff[0] : ''}</span>
                    </div>
                `;
                agendaList.appendChild(item);
            });
        }

        // Show Modal
        const modal = document.getElementById('profile-modal');
        modal.classList.add('show');
        modal.querySelector('.modal-container').style.opacity = '1'; // Ensure visibility
    }

    attachEvents() {
        // Search
        document.getElementById('search-directory').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = Array.from(this.profiles.values()).filter(p =>
                p.fullname.toLowerCase().includes(term) ||
                p.dni.includes(term)
            );
            this.renderGrid(filtered);
        });

        // Close Modal
        document.getElementById('close-profile-modal').addEventListener('click', () => {
            document.getElementById('profile-modal').classList.remove('show');
        });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

                // Set active
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
            });
        });
    }
}

// Init
const directoryApp = new DirectoryApp();
