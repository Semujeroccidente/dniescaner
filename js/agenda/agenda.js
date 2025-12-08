// Agenda Module - Main JavaScript

class AgendaApp {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.appointments = [];
        this.editingId = null;
        this.dbName = 'AgendaDB';
        this.dbVersion = 2;
        this.db = null;

        this.init();
    }

    async init() {
        await this.initDB();
        await this.ensureStaffDefaults();
        await this.loadStaff();
        await this.loadAppointments();
        this.renderCalendar();
        this.renderAppointments();
        this.attachEventListeners();
    }

    // IndexedDB Initialization
    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('appointments')) {
                    const store = db.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('time', 'time', { unique: false });
                }
                // Ensure staff store exists
                if (!db.objectStoreNames.contains('staff')) {
                    const staffStore = db.createObjectStore('staff', { keyPath: 'id', autoIncrement: true });
                    staffStore.createIndex('role', 'role', { unique: true });
                }
            };
        });
    }



    // New: Seed Default Staff if missing
    async ensureStaffDefaults() {
        return new Promise((resolve) => {
            const tx = this.db.transaction('staff', 'readwrite');
            const store = tx.objectStore('staff');
            const countReq = store.count();

            countReq.onsuccess = () => {
                if (countReq.result === 0) {
                    const defaults = [
                        { role: 'JEFE DE REGIONAL', icon: 'fa-solid fa-user-check' },
                        { role: 'OFICIAL JURIDICO', icon: 'fa-solid fa-gavel' },
                        { role: 'ASISTENTE JURIDICO', icon: 'fa-solid fa-scale-balanced' },
                        { role: 'TECNICO', icon: 'fa-solid fa-laptop-code' },
                        { role: 'CONDUCTOR', icon: 'fa-solid fa-car' }
                    ];
                    defaults.forEach(d => store.add(d));
                    console.log("Seeded default staff in Agenda");
                }
                resolve();
            };
            countReq.onerror = () => resolve(); // Ignore error
        });
    }

    // New: Load and Render Staff
    async loadStaff() {
        return new Promise((resolve) => {
            const tx = this.db.transaction('staff', 'readonly');
            const store = tx.objectStore('staff');
            const req = store.getAll();

            req.onsuccess = () => {
                const staff = req.result;
                this.renderStaffFilters(staff);
                this.renderStaffSelection(staff);
                resolve();
            };
        });
    }

    renderStaffFilters(staff) {
        const select = document.getElementById('filter-staff');
        if (!select) return;
        select.innerHTML = '<option value="">Todos los miembros</option>';
        staff.forEach(s => {
            select.innerHTML += `<option value="${s.role}">${this.capitalize(s.role)}</option>`;
        });
    }

    renderStaffSelection(staff) {
        const container = document.getElementById('appointment-staff');
        if (!container) return;
        container.innerHTML = '';

        staff.forEach(s => {
            const label = document.createElement('label');
            label.className = 'chip-choice';
            label.innerHTML = `
                <input type="checkbox" name="staff" value="${s.role}">
                <span class="chip-content">
                    <i class="${s.icon || 'fa-solid fa-user'}"></i> ${this.capitalize(s.role)}
                </span>
            `;
            container.appendChild(label);
        });

        // Add "All Team" option
        const allLabel = document.createElement('label');
        allLabel.className = 'chip-choice chip-all';
        allLabel.innerHTML = `
            <input type="checkbox" name="staff" value="TODO EL EQUIPO" id="select-all-staff">
            <span class="chip-content">
                <i class="fa-solid fa-users"></i> Todo el Equipo
            </span>
        `;
        container.appendChild(allLabel);

        // Attach Select All event
        setTimeout(() => {
            const allCheckbox = document.getElementById('select-all-staff');
            if (allCheckbox) {
                allCheckbox.addEventListener('change', (e) => {
                    const checkboxes = document.querySelectorAll('input[name="staff"]:not(#select-all-staff)');
                    checkboxes.forEach(cb => cb.checked = e.target.checked);
                });
            }
        }, 0);
    }

    capitalize(str) {
        return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }

    // Load appointments from IndexedDB
    async loadAppointments() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['appointments'], 'readonly');
            const store = transaction.objectStore('appointments');
            const request = store.getAll();

            request.onsuccess = () => {
                this.appointments = request.result;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Save appointment to IndexedDB
    async saveAppointment(appointment) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['appointments'], 'readwrite');
            const store = transaction.objectStore('appointments');
            const request = store.add(appointment);

            request.onsuccess = () => {
                appointment.id = request.result;
                this.appointments.push(appointment);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Update appointment in IndexedDB
    async updateAppointment(id, appointment) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['appointments'], 'readwrite');
            const store = transaction.objectStore('appointments');
            appointment.id = id;
            const request = store.put(appointment);

            request.onsuccess = () => {
                const index = this.appointments.findIndex(a => a.id === id);
                if (index !== -1) {
                    this.appointments[index] = appointment;
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Delete appointment from IndexedDB
    async deleteAppointment(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['appointments'], 'readwrite');
            const store = transaction.objectStore('appointments');
            const request = store.delete(id);

            request.onsuccess = () => {
                this.appointments = this.appointments.filter(a => a.id !== id);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Calendar Navigation
    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderCalendar();
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderCalendar();
    }

    goToToday() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.renderCalendar();
        this.renderAppointments();
        this.clearForm();
    }

    // Render Calendar
    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // Update header
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        document.getElementById('current-month-year').textContent = `${monthNames[month]} ${year}`;

        // Generate calendar days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const prevLastDay = new Date(year, month, 0);

        const firstDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const daysInPrevMonth = prevLastDay.getDate();

        const calendarGrid = document.getElementById('calendar-grid');
        calendarGrid.innerHTML = '';

        // Day headers
        const dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            calendarGrid.appendChild(header);
        });

        // Previous month days
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const day = this.createDayElement(daysInPrevMonth - i, month - 1, year, true);
            calendarGrid.appendChild(day);
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const day = this.createDayElement(i, month, year, false);
            calendarGrid.appendChild(day);
        }

        // Next month days - Fill only until the end of the last week needed
        const totalDaysShown = firstDayOfWeek + daysInMonth;
        const totalRows = Math.ceil(totalDaysShown / 7);
        const remainingDays = (totalRows * 7) - totalDaysShown;

        for (let i = 1; i <= remainingDays; i++) {
            const day = this.createDayElement(i, month + 1, year, true);
            calendarGrid.appendChild(day);
        }
    }

    createDayElement(day, month, year, isOtherMonth) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Check if today
        const today = new Date();
        if (!isOtherMonth &&
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()) {
            dayElement.classList.add('today');
        }

        // Check if selected
        if (this.selectedDate && dateStr === this.selectedDate) {
            dayElement.classList.add('selected');
        }

        // Check if has appointments
        const dayAppointments = this.appointments.filter(a => a.date === dateStr);
        if (dayAppointments.length > 0) {
            dayElement.classList.add('has-appointment');
            dayElement.setAttribute('data-event-count', dayAppointments.length);
        }

        dayElement.innerHTML = `
            <span class="day-number">${day}</span>
            ${dayAppointments.length > 0 ? `<span class="day-appointments">${dayAppointments.length} cita${dayAppointments.length > 1 ? 's' : ''}</span>` : ''}
        `;

        // Add click event listener for ALL days (including other months)
        dayElement.addEventListener('click', () => {
            if (isOtherMonth) {
                // If clicking prev/next month day, navigate there
                if (day > 15) { // It's likely previous month (dates 20-31)
                    this.previousMonth();
                } else { // It's likely next month (dates 1-14)
                    this.nextMonth();
                }
                // Also select the date
                setTimeout(() => this.selectDate(dateStr), 0);
            } else {
                this.selectDate(dateStr);
            }
        });

        // Add double click listener to scroll to form and focus title
        dayElement.addEventListener('dblclick', () => {
            // Ensure date is selected first
            if (isOtherMonth) {
                if (day > 15) this.previousMonth();
                else this.nextMonth();
                setTimeout(() => this.selectDate(dateStr), 0);
            } else {
                this.selectDate(dateStr);
            }

            // Scroll to form and focus title
            const formSection = document.getElementById('form-section');
            const titleInput = document.getElementById('appointment-title');

            formSection.scrollIntoView({ behavior: 'smooth' });
            setTimeout(() => titleInput.focus(), 500); // Wait for scroll
        });

        return dayElement;
    }

    selectDate(dateStr) {
        this.selectedDate = dateStr;
        this.renderCalendar();
        this.renderAppointments();

        // Pre-fill form with selected date
        document.getElementById('appointment-date').value = dateStr;
    }

    // Render Appointments List - Updated with Search and Filter
    renderAppointments() {
        const container = document.getElementById('appointments-list');
        const searchText = document.getElementById('search-appointments')?.value.toLowerCase() || '';
        const filterStaff = document.getElementById('filter-staff')?.value || '';

        let filteredAppointments = this.appointments;

        // Filter by Date (if selected)
        if (this.selectedDate) {
            filteredAppointments = this.appointments.filter(a => a.date === this.selectedDate);
        }

        // Filter by Search Text (Title)
        if (searchText) {
            filteredAppointments = filteredAppointments.filter(a =>
                a.title.toLowerCase().includes(searchText)
            );
        }

        // Filter by Staff
        if (filterStaff) {
            filteredAppointments = filteredAppointments.filter(a =>
                a.staff && a.staff.includes(filterStaff)
            );
        }

        // Sort by date and time
        filteredAppointments.sort((a, b) => {
            if (a.date !== b.date) {
                return new Date(a.date) - new Date(b.date);
            }
            return a.time.localeCompare(b.time);
        });

        if (filteredAppointments.length === 0) {
            container.innerHTML = `
                <div class="empty-appointments">
                    <i class="fa-regular fa-calendar-xmark"></i>
                    <p>${searchText || filterStaff ? 'No se encontraron citas con estos filtros' :
                    this.selectedDate ? 'No hay citas para esta fecha' : 'No hay citas programadas'
                }</p>
                </div>
            `;
            return;
        }

        container.innerHTML = ''; // Clear container
        filteredAppointments.forEach(appointment => {
            const item = document.createElement('div');
            item.className = 'appointment-item';
            item.innerHTML = `
                <div class="appointment-title">${appointment.title}</div>
                <div class="appointment-time">
                    <i class="fa-regular fa-clock"></i>
                    ${this.formatTime(appointment.time)} - ${this.formatDate(appointment.date)}
                </div>
                ${appointment.staff && appointment.staff.length > 0 ? `<div class="appointment-description"><i class="fa-solid fa-user-tie"></i> ${this.formatStaffList(appointment.staff)}</div>` : ''}
                ${appointment.description ? `<div class="appointment-description">${appointment.description}</div>` : ''}
                <div class="appointment-actions">
                    <button class="btn-edit" data-id="${appointment.id}">
                        <i class="fa-solid fa-pen"></i> Editar
                    </button>
                    <button class="btn-delete" data-id="${appointment.id}">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </div>
            `;

            // Add event listeners with proper scope
            const editBtn = item.querySelector('.btn-edit');
            const deleteBtn = item.querySelector('.btn-delete');

            editBtn.addEventListener('click', () => {
                this.editAppointment(appointment.id);
            });

            deleteBtn.addEventListener('click', () => {
                this.confirmDelete(appointment.id);
            });

            container.appendChild(item);
        });
    }

    formatTime(timeStr) {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':');
        const hour = parseInt(h);
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${String(hour12).padStart(2, '0')}:${m} ${period}`;
    }

    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const day = date.getDate();
        const month = date.getMonth();
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
            'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${day} ${monthNames[month]}`;
    }

    // Form handling & Event Listeners
    attachEventListeners() {
        document.getElementById('btn-prev-month').addEventListener('click', () => this.previousMonth());
        document.getElementById('btn-next-month').addEventListener('click', () => this.nextMonth());
        document.getElementById('btn-today').addEventListener('click', () => this.goToToday());

        document.getElementById('appointment-form').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('btn-cancel-form').addEventListener('click', () => this.clearForm());

        // Search and Filter Listeners
        const searchInput = document.getElementById('search-appointments');
        const filterSelect = document.getElementById('filter-staff');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderAppointments());
        }
        if (filterSelect) {
            filterSelect.addEventListener('change', () => this.renderAppointments());
        }

        // Custom Modal Listeners
        const modal = document.getElementById('confirmation-modal');
        const btnCancelModal = document.getElementById('btn-modal-cancel');
        const btnConfirmModal = document.getElementById('btn-modal-confirm');

        if (btnCancelModal) {
            btnCancelModal.addEventListener('click', () => {
                this.hideModal();
                this.pendingDeleteId = null;
            });
        }

        // We'll attach the confirm listener dynamically or here if we use a class property
        if (btnConfirmModal) {
            btnConfirmModal.addEventListener('click', async () => {
                if (this.pendingDeleteId) {
                    await this.executeDelete(this.pendingDeleteId);
                    this.hideModal();
                    this.pendingDeleteId = null;
                }
            });
        }

        // Close modal on outside click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                    this.pendingDeleteId = null;
                }
            });
        }

        // Time Selectors Logic
        const hourSelect = document.getElementById('time-hour');
        const minuteSelect = document.getElementById('time-minute');
        const periodSelect = document.getElementById('time-period');
        const hiddenInput = document.getElementById('appointment-time');

        const updateHiddenTime = () => {
            let hour = parseInt(hourSelect.value);
            const minute = minuteSelect.value;
            const period = periodSelect.value;

            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;

            hiddenInput.value = `${String(hour).padStart(2, '0')}:${minute}`;
        };

        if (hourSelect && minuteSelect && periodSelect) {
            hourSelect.addEventListener('change', updateHiddenTime);
            minuteSelect.addEventListener('change', updateHiddenTime);
            periodSelect.addEventListener('change', updateHiddenTime);
            // Initialize hidden input
            updateHiddenTime();
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const selectedStaff = this.getSelectedStaff();

        // If no staff selected, getSelectedStaff already showed an alert
        if (!selectedStaff) {
            return;
        }

        const appointment = {
            date: document.getElementById('appointment-date').value,
            time: document.getElementById('appointment-time').value,
            title: document.getElementById('appointment-title').value,
            staff: selectedStaff,
            description: document.getElementById('appointment-description').value
        };

        try {
            if (this.editingId) {
                await this.updateAppointment(this.editingId, appointment);
                this.showNotification('Cita actualizada exitosamente', 'success');
            } else {
                await this.saveAppointment(appointment);
                this.showNotification('Cita creada exitosamente', 'success');
            }

            this.clearForm();
            this.renderCalendar();
            this.renderAppointments();
        } catch (error) {
            console.error('Error saving appointment:', error);
            this.showNotification('Error al guardar la cita', 'error');
        }
    }

    editAppointment(id) {
        const appointment = this.appointments.find(a => a.id === id);
        if (!appointment) return;

        this.editingId = id;
        document.getElementById('appointment-date').value = appointment.date;
        document.getElementById('appointment-title').value = appointment.title;

        // Parse time for selectors
        const [h, m] = appointment.time.split(':');
        let hour = parseInt(h);
        const period = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;

        document.getElementById('time-hour').value = String(hour).padStart(2, '0');
        document.getElementById('time-minute').value = m;
        document.getElementById('time-period').value = period;
        document.getElementById('appointment-time').value = appointment.time; // Update hidden input too

        this.setSelectedStaff(appointment.staff || []);
        document.getElementById('appointment-description').value = appointment.description || '';

        document.getElementById('form-title').textContent = 'Editar Cita';
        document.getElementById('btn-submit-form').innerHTML = '<i class="fa-solid fa-save"></i> Actualizar';

        // Scroll to form
        document.getElementById('form-section').scrollIntoView({ behavior: 'smooth' });
    }

    confirmDelete(id) {
        this.pendingDeleteId = id;
        this.showModal();
    }

    showModal() {
        const modal = document.getElementById('confirmation-modal');
        if (modal) modal.classList.add('show');
    }

    hideModal() {
        const modal = document.getElementById('confirmation-modal');
        if (modal) modal.classList.remove('show');
    }

    async executeDelete(id) {
        try {
            await this.deleteAppointment(id);
            this.renderCalendar();
            this.renderAppointments();
            this.showNotification('Cita eliminada exitosamente', 'success');
        } catch (error) {
            console.error('Error deleting appointment:', error);
            this.showNotification('Error al eliminar la cita', 'error');
        }
    }

    clearForm() {
        this.editingId = null;
        document.getElementById('appointment-form').reset();
        document.getElementById('form-title').textContent = 'Nueva Cita';
        document.getElementById('btn-submit-form').innerHTML = '<i class="fa-solid fa-plus"></i> Crear Cita';

        // Reset Time Selectors Sync
        // Dispatch event to update hidden input based on default select values
        setTimeout(() => {
            const hourSelect = document.getElementById('time-hour');
            if (hourSelect) hourSelect.dispatchEvent(new Event('change'));
        }, 0);

        // Clear staff selection
        this.setSelectedStaff([]);

        if (this.selectedDate) {
            document.getElementById('appointment-date').value = this.selectedDate;
        }
    }

    // Helper functions for staff checkbox management
    getSelectedStaff() {
        const checkboxes = document.querySelectorAll('#appointment-staff input[type="checkbox"]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);

        // Validate at least one is selected
        if (selected.length === 0) {
            alert('Por favor seleccione al menos un miembro del personal');
            return null;
        }

        return selected;
    }

    setSelectedStaff(staffArray) {
        // Clear all checkboxes first
        const checkboxes = document.querySelectorAll('#appointment-staff input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        // Check the ones in the array
        if (Array.isArray(staffArray)) {
            staffArray.forEach(staffValue => {
                const checkbox = document.querySelector(`#appointment-staff input[value="${staffValue}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        }
    }

    formatStaffList(staffArray) {
        if (!Array.isArray(staffArray) || staffArray.length === 0) {
            return 'No asignado';
        }

        // Format staff names with proper capitalization
        const formatted = staffArray.map(staff => {
            return staff.split(' ').map(word =>
                word.charAt(0) + word.slice(1).toLowerCase()
            ).join(' ');
        });

        return formatted.join(', ');
    }

    showNotification(message, type) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        `;

        // Add to body
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize app
let agendaApp;
window.addEventListener('DOMContentLoaded', () => {
    agendaApp = new AgendaApp();
});
