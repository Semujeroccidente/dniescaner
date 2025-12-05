// Agenda Module - Main JavaScript

class AgendaApp {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.appointments = [];
        this.editingId = null;
        this.dbName = 'AgendaDB';
        this.dbVersion = 1;
        this.db = null;

        this.init();
    }

    async init() {
        await this.initDB();
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
            };
        });
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

    // Render Appointments List
    renderAppointments() {
        const container = document.getElementById('appointments-list');

        let filteredAppointments = this.appointments;
        if (this.selectedDate) {
            filteredAppointments = this.appointments.filter(a => a.date === this.selectedDate);
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
                    <p>${this.selectedDate ? 'No hay citas para esta fecha' : 'No hay citas programadas'}</p>
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

    // Form handling
    attachEventListeners() {
        document.getElementById('btn-prev-month').addEventListener('click', () => this.previousMonth());
        document.getElementById('btn-next-month').addEventListener('click', () => this.nextMonth());
        document.getElementById('btn-today').addEventListener('click', () => this.goToToday());

        document.getElementById('appointment-form').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('btn-cancel-form').addEventListener('click', () => this.clearForm());

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

        hourSelect.addEventListener('change', updateHiddenTime);
        minuteSelect.addEventListener('change', updateHiddenTime);
        periodSelect.addEventListener('change', updateHiddenTime);

        // Initialize hidden input
        updateHiddenTime();
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

    async confirmDelete(id) {
        if (confirm('¿Está seguro de eliminar esta cita?')) {
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
    }

    clearForm() {
        this.editingId = null;
        document.getElementById('appointment-form').reset();
        document.getElementById('form-title').textContent = 'Nueva Cita';
        document.getElementById('btn-submit-form').innerHTML = '<i class="fa-solid fa-plus"></i> Crear Cita';

        // Reset Time Selectors Sync
        // Dispatch event to update hidden input based on default select values
        setTimeout(() => {
            document.getElementById('time-hour').dispatchEvent(new Event('change'));
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
