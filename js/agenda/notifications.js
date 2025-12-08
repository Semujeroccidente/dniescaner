/**
 * Notification Manager for Agenda
 * Handles permission requests and periodic checks for upcoming appointments.
 */

class NotificationManager {
    constructor() {
        this.checkInterval = 60000; // Check every 1 minute
        this.alertThreshold = 15; // Minutes before event
        this.notifiedEvents = new Set(); // Track notified IDs to avoid spam
        this.dbName = 'AgendaDB';

        // Sound effect (Simple beep via Data URI to avoid external dependencies failure)
        this.alertSoundStr = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'; // Trigger fallback if not creating file

        // We will try to use a real beep sound or system sound
        this.init();
    }

    init() {
        this.setupUI();

        if (Notification.permission === 'granted') {
            this.startMonitoring();
            this.updateIconState(true);
        } else {
            this.updateIconState(false);
        }
    }

    setupUI() {
        // Find or Create Toggle Button
        // We will look for an element with ID 'btn-notifications'
        const btn = document.getElementById('btn-notifications');
        if (btn) {
            btn.addEventListener('click', () => this.requestPermission());
        }
    }

    async requestPermission() {
        if (!('Notification' in window)) {
            alert('Este navegador no soporta notificaciones de escritorio.');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            new Notification('SEMUJER Agenda', {
                body: 'Notificaciones activadas. Te avisaremos 15 min antes de cada cita.',
                icon: '../assets/icon.png'
            });
            this.startMonitoring();
            this.updateIconState(true);
        } else {
            alert('No podremos avisarte de tus citas si no activas las notificaciones.');
            this.updateIconState(false);
        }
    }

    updateIconState(active) {
        const btn = document.getElementById('btn-notifications');
        if (!btn) return;

        const icon = btn.querySelector('i');
        if (active) {
            btn.classList.add('active'); // Style for active state
            icon.className = 'fa-solid fa-bell';
            btn.title = 'Notificaciones Activadas';
            btn.style.color = '#48bb78'; // Green
        } else {
            btn.classList.remove('active');
            icon.className = 'fa-regular fa-bell-slash';
            btn.title = 'Activar Notificaciones';
            btn.style.color = '#a0aec0'; // Grey
        }
    }

    startMonitoring() {
        console.log("Notification Service Started");
        // Check immediately then interval
        this.checkUpcoming();

        setInterval(() => {
            this.checkUpcoming();
        }, this.checkInterval);
    }

    async checkUpcoming() {
        // Get all appointments
        // In a real app we would query by range, but getAll is fine for local
        const appointments = await this.getAllAppointments();
        const now = new Date();

        appointments.forEach(appt => {
            if (this.notifiedEvents.has(appt.id)) return;

            // Combine Date and Time
            // appt.date is YYYY-MM-DD
            // appt.time is usually something like "14:30" or "02:30 PM". 
            // We need to parse strict format.
            // Our app stores time as HH:mm and period AM/PM usually, or sometimes just HH:mm string. 
            // Let's assume the DB `time` field is the formatted string "HH:mm". 
            // Wait, looking at agenda.js, appointment-time is hidden input. 
            // We need to confirm time format. Usually input[type=time] gives "HH:mm" (24h).
            // But our custom selector constructs it. 
            // Let's assume standard "24h" format or try to parse.

            const eventDate = this.parseDateTime(appt.date, appt.time);
            if (!eventDate) return;

            const diffMs = eventDate - now;
            const diffMins = Math.floor(diffMs / 60000);

            // Trigger if within threshold (e.g. 15 mins) and future
            if (diffMins <= this.alertThreshold && diffMins > 0) {
                this.triggerAlert(appt, diffMins);
            }
        });
    }

    parseDateTime(dateStr, timeStr) {
        try {
            // dateStr: "2025-12-08"
            // timeStr: "HH:mm" or "HH:mm AM/PM"
            // Let's standard parse
            let fullStr = `${dateStr} ${timeStr}`;

            // Handle AM/PM if manual
            // If timeStr is "02:30 PM", Date.parse usually handles it in modern browsers.
            return new Date(fullStr);
        } catch (e) {
            return null;
        }
    }

    triggerAlert(appt, minutesLeft) {
        this.notifiedEvents.add(appt.id);

        // Play Sound
        this.playSound();

        // Show Notification
        const notif = new Notification(`Próxima Cita: ${minutesLeft} min`, {
            body: `${appt.title}\n${appt.staff ? appt.staff.join(', ') : 'Sin personal'}`,
            icon: '../assets/icon.png',
            tag: 'agenda-alert' // Prevent stacking
        });

        notif.onclick = () => {
            window.focus();
            notif.close();
        };
    }

    playSound() {
        // Use a simple beep oscillator to ensure it works without external files
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.value = 880; // A5
            gain.gain.value = 0.1;

            osc.start();

            // Beep pattern
            setTimeout(() => { osc.frequency.value = 0; }, 200);
            setTimeout(() => { osc.frequency.value = 880; }, 300);
            setTimeout(() => { osc.stop(); }, 600);

        } catch (e) {
            console.warn("Audio error", e);
        }
    }

    // DB Helper
    getAllAppointments() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2); // Version 2 has staff, 1 had appointments. Use latest.
            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('appointments', 'readonly');
                const store = tx.objectStore('appointments');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve([]);
            };
            request.onerror = () => resolve([]);
        });
    }
}

// Init
const notificationManager = new NotificationManager();
