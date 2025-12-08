/**
 * Settings Module - Staff Management
 * Handles CRUD operations for the 'staff' object store in AgendaDB.
 */

class SettingsApp {
    constructor() {
        this.dbName = 'AgendaDB';
        this.dbVersion = 2; // Incrementing version to create new store
        this.db = null;
        this.defaultStaff = [
            { role: 'JEFE DE REGIONAL', icon: 'fa-solid fa-user-check' },
            { role: 'OFICIAL JURIDICO', icon: 'fa-solid fa-gavel' },
            { role: 'ASISTENTE JURIDICO', icon: 'fa-solid fa-scale-balanced' },
            { role: 'TECNICO', icon: 'fa-solid fa-laptop-code' },
            { role: 'CONDUCTOR', icon: 'fa-solid fa-car' }
        ];

        this.init();
    }

    async init() {
        try {
            await this.initDB();
            await this.seedDefaults();
            this.loadStaff();
            this.attachEvents();
        } catch (error) {
            console.error("Settings Init Error:", error);
            alert("Error inicializando configuración.");
        }
    }

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Ensure appointments store exists (might be upgrading from v1)
                if (!db.objectStoreNames.contains('appointments')) {
                    db.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
                }
                // Create Staff store
                if (!db.objectStoreNames.contains('staff')) {
                    const store = db.createObjectStore('staff', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('role', 'role', { unique: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async seedDefaults() {
        const staff = await this.getAllStaff();
        if (staff.length === 0) {
            console.log("Seeding default staff...");
            const tx = this.db.transaction('staff', 'readwrite');
            const store = tx.objectStore('staff');

            for (const s of this.defaultStaff) {
                store.add(s);
            }

            return new Promise(resolve => tx.oncomplete = resolve);
        }
    }

    getAllStaff() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('staff', 'readonly');
            const store = tx.objectStore('staff');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async loadStaff() {
        const staff = await this.getAllStaff();
        const list = document.getElementById('staff-list');
        list.innerHTML = '';

        staff.forEach(s => {
            const item = document.createElement('div');
            item.className = 'staff-item';
            item.innerHTML = `
                <div class="staff-info">
                    <div class="staff-avatar">
                        <i class="${s.icon || 'fa-solid fa-user'}"></i>
                    </div>
                    <div class="staff-details">
                        <h4>${s.role}</h4>
                        <p>Activo</p>
                    </div>
                </div>
                <div class="staff-actions">
                    <button class="btn-icon btn-edit" onclick="settingsApp.editStaff(${s.id}, '${s.role}', '${s.icon}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="settingsApp.deleteStaff(${s.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
    }

    attachEvents() {
        const modal = document.getElementById('staff-modal');
        const form = document.getElementById('staff-form');

        // Open Add Modal
        document.getElementById('btn-add-staff').addEventListener('click', () => {
            document.getElementById('staff-id').value = '';
            document.getElementById('staff-role').value = '';
            document.getElementById('modal-title').textContent = 'Agregar Miembro';
            modal.classList.add('show');
        });

        // Close Modal
        document.getElementById('btn-cancel').addEventListener('click', () => {
            modal.classList.remove('show');
        });

        // Backup Events
        const btnBackup = document.getElementById('btn-backup');
        if (btnBackup) btnBackup.addEventListener('click', () => this.backupData());

        const btnRestoreTrigger = document.getElementById('btn-restore-trigger');
        const fileInput = document.getElementById('backup-file-input');

        if (btnRestoreTrigger && fileInput) {
            btnRestoreTrigger.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.restoreData(e.target.files[0]);
                }
            });
        }

        // Submit Logic
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('staff-id').value;
            const role = document.getElementById('staff-role').value.toUpperCase(); // Standardize
            const icon = document.getElementById('staff-icon').value;

            const tx = this.db.transaction('staff', 'readwrite');
            const store = tx.objectStore('staff');

            if (id) {
                // Update
                store.put({ id: Number(id), role, icon });
            } else {
                // Add
                store.add({ role, icon });
            }

            tx.oncomplete = () => {
                modal.classList.remove('show');
                this.loadStaff();
            };
        });
    }

    // Exposed to window for onclick handlers
    editStaff(id, role, icon) {
        document.getElementById('staff-id').value = id;
        document.getElementById('staff-role').value = role;
        document.getElementById('staff-icon').value = icon;
        document.getElementById('modal-title').textContent = 'Editar Miembro';
        document.getElementById('staff-modal').classList.add('show');
    }

    async deleteStaff(id) {
        if (confirm('¿Seguro que deseas eliminar este cargo?')) {
            const tx = this.db.transaction('staff', 'readwrite');
            const store = tx.objectStore('staff');
            store.delete(id);
            tx.oncomplete = () => this.loadStaff();
        }
    }

    // ==========================================
    // BACKUP & RESTORE MODULE
    // ==========================================

    async backupData() {
        const btn = document.getElementById('btn-backup');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';
        btn.disabled = true;

        try {
            // Fetch all data
            const appointments = await this.getAllFromStore('AgendaDB', 'appointments', 2);
            const staff = await this.getAllFromStore('AgendaDB', 'staff', 2);
            const records = await this.getAllFromStore('DNI_Scanner_DB', 'records', 1);

            const backup = {
                version: 1,
                timestamp: new Date().toISOString(),
                agenda: { appointments, staff },
                dni_scanner: { records }
            };

            // Download
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SEMUJER_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert('Copia de seguridad descargada con éxito.');

        } catch (error) {
            console.error(error);
            alert('Error al crear copia de seguridad.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    async restoreData(file) {
        if (!confirm('ADVERTENCIA: Esto sobrescribirá los datos actuales. Se recomienda hacer una copia antes. ¿Continuar?')) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Validate Basic Structure
                if (!data.agenda || !data.dni_scanner) {
                    throw new Error('Formato de archivo inválido.');
                }

                alert('Iniciando restauración... Por favor espere.');

                // Restore Agenda
                await this.restoreStore('AgendaDB', 'appointments', data.agenda.appointments, 2);
                await this.restoreStore('AgendaDB', 'staff', data.agenda.staff, 2);

                // Restore Records
                await this.restoreStore('DNI_Scanner_DB', 'records', data.dni_scanner.records, 1);

                alert('¡Restauración completada! La página se recargará.');
                location.reload();

            } catch (error) {
                console.error(error);
                alert('Error al restaurar: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    // Helpers
    getAllFromStore(dbName, storeName, version) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, version);
            req.onerror = () => resolve([]); // Fail safe
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

    restoreStore(dbName, storeName, data, version) {
        return new Promise((resolve, reject) => {
            if (!data || !Array.isArray(data)) {
                resolve();
                return;
            }
            const req = indexedDB.open(dbName, version);
            req.onerror = () => reject(req.error);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    // Store doesn't exist? Skip
                    resolve();
                    return;
                }
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);

                // Option: Clear then Add, or Just Add (Merge/Update)
                // We will use put() to update existing IDs and add new ones.
                // NOTE: If IDs match, it updates. If not, adds. 
                // This is a Merge logic. To do full Restore (replace), we should clear().
                // Let's do Full Replace for consistency with "Restore".
                store.clear();

                data.forEach(item => store.put(item));

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
        });
    }

    const settingsApp = new SettingsApp();
// Expose for inline onclicks
window.settingsApp = settingsApp;
