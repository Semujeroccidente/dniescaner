// app.js

const UIHelpers = {
    showNotification: (message, type = 'info') => {
        const colors = {
            error: '#f85032',
            success: '#43e97b',
            warning: '#f5a623',
            info: '#4facfe'
        };
        const notification = document.createElement('div');
        notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${colors[type] || colors.info}; color: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; font-weight: 500;`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    },
    validateDNI: (dni) => {
        const cleaned = dni.replace(/[^0-9]/g, '');
        if (cleaned.length !== 13) return false;
        const digits = cleaned.slice(0, 12).split('').map(Number);
        const weights = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
        let sum = digits.reduce((acc, d, i) => acc + (d * weights[i]), 0);
        const expectedChecksum = (11 - (sum % 11)) % 10;
        return expectedChecksum === Number(cleaned[12]);
    },
    closeModal: (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    },
    openModal: (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
        }
    },
    showConfirmation: (title, message, onConfirm, onCancel) => {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'modal';
        confirmModal.style.display = 'flex'; // Ensure it's visible
        confirmModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="modal-body">
                    <p style="white-space: pre-line;">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
                    <button class="btn btn-primary" id="confirm-ok">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(confirmModal);

        const close = () => {
            confirmModal.remove();
        };

        document.getElementById('confirm-cancel').onclick = () => {
            close();
            if (onCancel) onCancel();
        };

        document.getElementById('confirm-ok').onclick = () => {
            close();
            if (onConfirm) onConfirm();
        };
    },
    generateQRCode: (data, elementId) => {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Limpiar contenido previo
        element.innerHTML = '';

        try {
            new QRCode(element, {
                text: data,
                width: 250,
                height: 250,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (err) {
            console.error('Error generating QR code:', err);
            element.innerHTML = `<p style="color: red; padding: 1rem;">Error al generar código QR</p>`;
        }
    }
};

// Dashboard Statistics Manager moved to js/statistics.js

// QR Code Manager moved to js/qrcode-handler.js

const app = {
    images: { front: null, back: null },
    currentEditingId: null,

    init: async () => {
        try {
            console.log("App initializing...");
            await dbManager.init();
            app.loadLocations();
            app.loadRecords();
            // Event delegation for record actions (delete/edit/view) in table
            const tbody = document.querySelector('#records-table tbody');
            if (tbody && !tbody._delegationAttached) {
                tbody.addEventListener('click', (e) => {
                    const btn = e.target.closest('button');
                    if (!btn) return;
                    const action = btn.dataset.action;
                    const id = btn.dataset.recordId;
                    if (!action || !id) return;
                    if (action === 'delete') {
                        app.deleteRecord(Number(id));
                    } else if (action === 'edit') {
                        app.editRecord(Number(id));
                    } else if (action === 'view') {
                        app.viewRecordImages(Number(id));
                    } else if (action === 'qr') {
                        QRManager.generateRecordQR(Number(id));
                    } else if (action === 'print') {
                        app.printRecord(Number(id));
                    }
                });
                tbody._delegationAttached = true;
            }


            // Detectar offline/online
            window.addEventListener('online', app.updateOnlineStatus);
            window.addEventListener('offline', app.updateOnlineStatus);
            app.updateOnlineStatus();
            console.log("App initialized successfully");
        } catch (err) {
            console.error("Error initializing app:", err);
            alert(`Error al inicializar la aplicación: ${err.message || err}`);
        }
    },

    updateOnlineStatus: () => {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.style.display = navigator.onLine ? 'none' : 'block';
        }
    },

    loadLocations: () => {
        const deptSelect = document.getElementById('department');
        if (!deptSelect) return; // Defensive check
        deptSelect.innerHTML = '<option value="">Seleccione</option>';
        Object.keys(HONDURAS_LOCATIONS).sort().forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            deptSelect.appendChild(option);
        });
    },

    formatDNI: (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 13) value = value.slice(0, 13);

        if (value.length > 8) {
            value = value.slice(0, 4) + '-' + value.slice(4, 8) + '-' + value.slice(8);
        } else if (value.length > 4) {
            value = value.slice(0, 4) + '-' + value.slice(4);
        }

        input.value = value;
    },

    formatPhone: (input) => {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 8) value = value.slice(0, 8);

        if (value.length > 4) {
            value = value.slice(0, 4) + '-' + value.slice(4);
        }

        input.value = value;
    },

    loadMunicipalities: () => {
        const deptSelect = document.getElementById('department');
        const muniSelect = document.getElementById('municipality');
        const selectedDept = deptSelect.value;
        muniSelect.innerHTML = '<option value="">Seleccione</option>';
        if (selectedDept && HONDURAS_LOCATIONS[selectedDept]) {
            HONDURAS_LOCATIONS[selectedDept].sort().forEach(muni => {
                const option = document.createElement('option');
                option.value = muni;
                option.textContent = muni;
                muniSelect.appendChild(option);
            });
        }
    },

    startCamera: (side) => {
        cameraManager.startCamera(side, (imageData, side) => {
            app.setImage(side, imageData);
        });
    },

    handleFileUpload: (event, side) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => app.setImage(side, e.target.result);
            reader.readAsDataURL(file);
        }
    },

    setImage: (side, imageData) => {
        app.images[side] = imageData;

        const previewBox = document.getElementById(`preview-${side}`);
        if (!previewBox) {
            console.error(`setImage: preview box not found for side '${side}'`);
            return;
        }
        const img = previewBox.querySelector('img');
        const placeholder = previewBox.querySelector('.placeholder');

        if (!img || !placeholder) {
            console.error(`setImage: img or placeholder not found for side '${side}'`);
            return;
        }

        img.src = imageData;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
        previewBox.classList.add('has-image');

        if (app.images.back) {
            document.getElementById('btn-process').disabled = false;
        }
    },

    processImages: async () => {
        if (!app.images.back) {
            UIHelpers.showNotification('Imagen del reverso requerida', 'error');
            return;
        }

        const btn = document.getElementById('btn-process');
        const status = document.getElementById('processing-status');
        const statusText = document.getElementById('status-text');
        const statusIcon = document.querySelector('#processing-status i');

        btn.disabled = true;
        btn.classList.add('loading');
        status.classList.remove('hidden');
        status.classList.remove('success', 'error');
        status.classList.add('animate-fade-in');

        if (statusIcon) {
            statusIcon.className = 'fas fa-spinner fa-spin';
        }
        statusText.innerText = "Iniciando escaneo inteligente...";

        try {
            // Escanear solo Reverso (MRZ)
            statusText.innerText = "📸 Escaneando Reverso (MRZ)...";

            const mrzResult = await mrzScanner.scanImage(app.images.back);

            // Normalización de datos (compatibilidad con mrz.js nuevo y viejo)
            if (mrzResult && mrzResult.data) {
                // El nuevo mrz.js ya devuelve snake_case, pero aseguramos
                const raw = mrzResult.data; // puede ser 'parsed' object
                // Si viene anidado en 'parsed', lo subimos? 
                // En mi implementación mrz.js:  return { ..., parsed, ... } o data:parsed.
                // Revisando mi mrz.js:
                // return { validation, confidence, parsed, mrzCropDataUrl }; 
                // Ah! mi nuevo mrz.js devuelve 'parsed' en la raíz del objeto, NO en 'data'. 
                // Espera, el codigo existente usa mrzResult.data. 
                // Tengo que adaptar app.js a la nueva estructura de mrz.js O adaptar mrz.js.
                // Mejor adapto app.js aquí mismo.

                const dataObj = mrzResult.parsed || mrzResult.data || {};

                mrzResult.data = {
                    document_number: dataObj.document_number || dataObj.documentNumber || '',
                    full_name: dataObj.full_name || dataObj.fullName || '',
                    birth_date: dataObj.birth_date || dataObj.birthDateISO || '',
                    sex: dataObj.sex || '',
                    format: dataObj.format || 'TD1',
                    _raw: dataObj
                };
            }

            if (!mrzResult || !mrzResult.data || !mrzResult.data.document_number) {
                throw new Error("No se detectó MRZ válido en la imagen.");
            }

            const finalData = { ...mrzResult.data };

            // Usar la validación interna del scanner
            const validationStatus = mrzResult.validation?.status || 'UNKNOWN';
            if (validationStatus !== "OK") {
                console.warn("Validación MRZ parcial o fallida:", mrzResult.validation);
                statusText.innerText = "⚠️ Lectura parcial - verifica datos";
                if (statusIcon) statusIcon.className = 'fas fa-check-circle';
                status.classList.add('success');
                UIHelpers.showNotification('Lectura parcial - verifica datos', 'warning');
            } else {
                statusText.innerText = "✓ Datos leídos correctamente";
                if (statusIcon) statusIcon.className = 'fas fa-check-circle';
                status.classList.add('success');
                UIHelpers.showNotification('Datos leídos correctamente', 'success');
            }

            app.populateForm(finalData);
            const formSection = document.getElementById('form-section');
            if (formSection) {
                formSection.classList.remove('hidden');
                formSection.classList.add('animate-fade-in');
                formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

        } catch (error) {
            console.error(error);
            statusText.innerText = "✕ Error en el procesamiento";
            if (statusIcon) {
                statusIcon.className = 'fas fa-exclamation-circle';
            }
            status.classList.add('error');
            UIHelpers.showNotification(`Error: ${error.message || error}`, 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
            setTimeout(() => {
                status.classList.add('hidden');
                statusText.innerText = "Procesando...";
            }, 3000);
        }
    },

    populateForm: (data) => {
        if (data.document_number) document.getElementById('dni').value = data.document_number;
        if (data.full_name) document.getElementById('fullname').value = data.full_name;
        if (data.sex) document.getElementById('gender').value = data.sex;
        if (data.birth_date) {
            document.getElementById('dob').value = app.formatInputDate(data.birth_date);
            app.calculateAge();
        }
    },

    formatInputDate: (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return '';
        dateStr = dateStr.trim();

        // Si ya viene en formato YYYY-MM-DD válido, devolver tal cual
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

        // Si viene en DD/MM/YYYY (con barras), convertir
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        // Si viene en DD-MM-YYYY (con guiones), convertir
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length === 3 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        return '';
    },

    calculateAge: () => {
        const dobInput = document.getElementById('dob').value;
        if (!dobInput) return;

        const dob = new Date(dobInput);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        document.getElementById('age').value = age;

        let range = '';
        if (age <= 12) range = 'Infante';
        else if (age <= 29) range = 'Joven';
        else if (age <= 59) range = 'Adulto';
        else range = 'Adulto Mayor';
        document.getElementById('age-range').value = range;
    },

    resetForm: () => {
        document.getElementById('dni-form').reset();
        app.images = { front: null, back: null };
        app.currentEditingId = null;

        // Resetear UI
        document.querySelector('#dni-form button[type="submit"]').textContent = "Guardar Registro";

        ['front', 'back'].forEach(side => {
            const previewBox = document.getElementById(`preview-${side}`);
            const img = previewBox.querySelector('img');
            const placeholder = previewBox.querySelector('.placeholder');

            img.src = '';
            img.classList.add('hidden');
            placeholder.classList.remove('hidden');
            previewBox.classList.remove('has-image');
        });

        document.getElementById('btn-process').disabled = true;
        document.getElementById('form-section').classList.add('hidden');
    },

    // Helper para comprimir imágenes antes de guardar
    compressImage: async (dataUrl, maxWidth = 800) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compresión JPEG 70%
            };
            img.src = dataUrl;
        });
    },

    editRecord: async (id) => {
        try {
            const records = await dbManager.getAllRecords();
            const record = records.find(r => r.id === id);
            if (!record) return;

            app.currentEditingId = id;

            // Poblar formulario with null checks
            const fieldMap = {
                'dni': record.dni || '',
                'fullname': record.fullname || '',
                'gender': record.gender || '',
                'dob': record.dob || '',
                'age': record.age || '',
                'age-range': record.ageRange || '',
                'phone': record.phone || ''
            };

            Object.entries(fieldMap).forEach(([fieldId, value]) => {
                const field = document.getElementById(fieldId);
                if (field) field.value = value;
            });

            // Cargar departamentos y municipios
            const deptSelect = document.getElementById('department');
            if (deptSelect) {
                deptSelect.value = record.department || '';
                app.loadMunicipalities();
                const muniSelect = document.getElementById('municipality');
                if (muniSelect) muniSelect.value = record.municipality || '';
            }

            // Cambiar texto del botón
            const submitBtn = document.querySelector('#dni-form button[type="submit"]');
            if (submitBtn) submitBtn.textContent = "Actualizar Registro";

            // Mostrar formulario
            app.showManualEntry();
        } catch (err) {
            console.error('Error loading record for edit:', err);
            alert(`Error al cargar el registro: ${err.message || err}`);
        }
    },

    showManualEntry: () => {
        try {
            const formSection = document.getElementById('form-section');
            if (formSection) {
                formSection.classList.remove('hidden');
                formSection.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) {
            console.error('Error showing form section:', err);
        }
    },

    saveRecord: async (event) => {
        event.preventDefault();
        try {
            const dniInput = document.getElementById('dni').value || '';
            if (!dniInput || dniInput.replace(/[^0-9]/g, '').length !== 13) {
                UIHelpers.showNotification('DNI debe tener 13 dígitos', 'error');
                return;
            }
            // Validación de checksum - solo advertencia, no bloquea el guardado
            if (!UIHelpers.validateDNI(dniInput)) {
                console.warn('DNI checksum validation failed for:', dniInput);
                // No bloqueamos el guardado, solo mostramos advertencia
                UIHelpers.showNotification('Advertencia: El DNI podría tener un error de dígito verificador', 'warning');
            }
            const fullname = document.getElementById('fullname').value || '';
            if (fullname.trim().length < 3) {
                UIHelpers.showNotification('Nombre mínimo 3 caracteres', 'error');
                return;
            }
            const dob = document.getElementById('dob').value || '';
            if (!dob) {
                UIHelpers.showNotification('Fecha de nacimiento requerida', 'error');
                return;
            }
            // Comprimir imágenes si existen
            let imgFront = app.images.front;
            let imgBack = app.images.back;

            if (imgFront) imgFront = await app.compressImage(imgFront);
            if (imgBack) imgBack = await app.compressImage(imgBack);

            // Obtener valores directamente de los inputs
            const record = {
                dni: dniInput,
                fullname: fullname,
                gender: document.getElementById('gender').value || '',
                dob: dob,
                age: document.getElementById('age').value || '',
                ageRange: document.getElementById('age-range').value || '',
                phone: document.getElementById('phone').value || '',
                department: document.getElementById('department').value || '',
                municipality: document.getElementById('municipality').value || '',
                imageFront: imgFront,
                imageBack: imgBack,
                date: new Date().toISOString()
            };

            if (app.currentEditingId) {
                // Actualizar registro existente
                // Recuperar imágenes anteriores si no se han cambiado
                const existingRecords = await dbManager.getAllRecords();
                const existingRecord = existingRecords.find(r => r.id === app.currentEditingId);

                if (existingRecord) {
                    record.id = app.currentEditingId;
                    record.date = existingRecord.date; // Mantener fecha original
                    if (!record.imageFront) record.imageFront = existingRecord.imageFront;
                    if (!record.imageBack) record.imageBack = existingRecord.imageBack;
                }

                await dbManager.updateRecord(record);
                UIHelpers.showNotification('Registro actualizado exitosamente', 'success');
            } else {
                // Crear nuevo registro
                await dbManager.addRecord(record);
                UIHelpers.showNotification('Registro guardado exitosamente', 'success');
            }

            app.resetForm();
            app.loadRecords();
        } catch (error) {
            console.error("Error saving record:", error);
            UIHelpers.showNotification(`Error: ${error.message || error}`, 'error');
        }
    },

    loadRecords: async () => {
        try {
            const records = await dbManager.getAllRecords();
            const tbody = document.querySelector('#records-table tbody');
            if (!tbody) {
                console.error('Records table body not found');
                return;
            }
            tbody.innerHTML = '';
            if (!records.length) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No hay registros aún.</td></tr>';
                if (typeof paginationManager !== 'undefined') {
                    paginationManager.init(0, () => { }); // Reset pagination
                }
                return;
            }

            records.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Initialize pagination
            if (typeof paginationManager !== 'undefined') {
                paginationManager.init(records.length, (page) => {
                    app.renderTablePage(records, page);
                });
            }

            // Render first page
            app.renderTablePage(records, 1);

            // Update dashboard

        } catch (err) {
            console.error('Error loading records:', err);
            alert(`Error al cargar registros: ${err.message || err}`);
        }
    },

    renderTablePage: (allRecords, page) => {
        const tbody = document.querySelector('#records-table tbody');
        tbody.innerHTML = '';

        const pageRecords = typeof paginationManager !== 'undefined'
            ? paginationManager.getPaginatedItems(allRecords)
            : allRecords;

        pageRecords.forEach(r => {
            try {
                if (!r) throw new Error('Registro inválido: null/undefined');
                // Defensive: ensure id exists
                if (typeof r.id === 'undefined') r.id = null; // allow rendering but warn
                const tr = document.createElement('tr');
                const dateStr = new Date(r.date).toLocaleDateString();

                // Create cells safely using textContent
                const cells = [
                    { text: dateStr },
                    { text: r.dni || '-' },
                    { text: r.fullname || '-' },
                    { text: r.age || '-' },
                    { text: r.phone || '-' },
                    { text: r.municipality && r.department ? `${r.municipality}, ${r.department}` : '-' }
                ];

                cells.forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell.text;
                    tr.appendChild(td);
                });

                // Action buttons (safe event listeners)
                const tdActions = document.createElement('td');
                const divActions = document.createElement('div');
                divActions.className = 'action-buttons';
                divActions.style.display = 'flex';
                divActions.style.gap = '5px';

                // Image button
                if (r.imageFront || r.imageBack) {
                    const imgBtn = document.createElement('button');
                    imgBtn.className = 'btn btn-small btn-primary';
                    imgBtn.title = 'Ver Fotos';
                    imgBtn.innerHTML = '<i class="fa-regular fa-image"></i>';
                    imgBtn.dataset.action = 'view';
                    imgBtn.dataset.recordId = r.id;
                    divActions.appendChild(imgBtn);
                }

                // Edit button
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-small btn-secondary';
                editBtn.title = 'Editar';
                editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                editBtn.dataset.action = 'edit';
                editBtn.dataset.recordId = r.id;
                divActions.appendChild(editBtn);

                // Print button
                const printBtn = document.createElement('button');
                printBtn.className = 'btn btn-small btn-secondary';
                printBtn.title = 'Imprimir Ficha';
                printBtn.innerHTML = '<i class="fa-solid fa-print"></i>';
                printBtn.dataset.action = 'print';
                printBtn.dataset.recordId = r.id;
                divActions.appendChild(printBtn);

                // QR button
                const qrBtn = document.createElement('button');
                qrBtn.className = 'btn btn-small btn-secondary';
                qrBtn.title = 'Generar QR';
                qrBtn.innerHTML = '<i class="fa-solid fa-qrcode"></i>';
                qrBtn.dataset.action = 'qr';
                qrBtn.dataset.recordId = r.id;
                divActions.appendChild(qrBtn);

                // Delete button
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-small btn-danger';
                delBtn.title = 'Eliminar';
                delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                // Data attributes for easier tracing/debugging
                delBtn.dataset.action = 'delete';
                delBtn.dataset.recordId = r.id;
                divActions.appendChild(delBtn);

                tdActions.appendChild(divActions);
                tr.appendChild(tdActions);
                tbody.appendChild(tr);
            } catch (rowErr) {
                console.error('Error rendering record row:', rowErr, 'Record:', r);
                // Add a safe fallback row indicating error for this record
                const trErr = document.createElement('tr');
                trErr.innerHTML = `<td colspan="7">Error al mostrar registro: ${rowErr.message}</td>`;
                tbody.appendChild(trErr);
                return; // continue to next record
            }

        });
    },


    viewRecordImages: async (id) => {
        try {
            const records = await dbManager.getAllRecords();
            const record = records.find(r => r.id === id);
            if (!record) return;

            const w = window.open("", "_blank");
            w.document.open();

            const doc = w.document;
            const html = doc.documentElement;

            // Create head
            const head = doc.createElement('head');
            const title = doc.createElement('title');
            title.textContent = `Fotos del Registro - ${record.dni}`;
            const style = doc.createElement('style');
            style.textContent = `
                body { font-family: sans-serif; text-align: center; padding: 20px; background: #f0f2f5; }
                img { max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
                h2 { color: #0f2c59; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 12px; }
            `;
            head.appendChild(title);
            head.appendChild(style);

            // Create body
            const body = doc.createElement('body');
            const container = doc.createElement('div');
            container.className = 'container';

            const h2 = doc.createElement('h2');
            h2.textContent = `${record.fullname} (${record.dni})`;
            container.appendChild(h2);

            if (record.imageFront) {
                const h3Front = doc.createElement('h3');
                h3Front.textContent = 'Frente';
                const imgFront = doc.createElement('img');
                imgFront.src = record.imageFront;
                container.appendChild(h3Front);
                container.appendChild(imgFront);
            }

            if (record.imageBack) {
                const h3Back = doc.createElement('h3');
                h3Back.textContent = 'Reverso';
                const imgBack = doc.createElement('img');
                imgBack.src = record.imageBack;
                container.appendChild(h3Back);
                container.appendChild(imgBack);
            }

            body.appendChild(container);
            html.appendChild(head);
            html.appendChild(body);
            w.document.close();
        } catch (err) {
            console.error('Error opening record images:', err);
            alert('Error al abrir las imágenes del registro.');
        }
    },

    printRecord: async (id) => {
        try {
            const records = await dbManager.getAllRecords();
            const record = records.find(r => r.id === id);
            if (!record) {
                console.error('❌ Record not found:', id);
                return;
            }

            console.log('🖨️ Printing record:', {
                id: record.id,
                dni: record.dni,
                hasFrontImage: !!record.imageFront,
                hasBackImage: !!record.imageBack,
                frontSize: record.imageFront ? `${(record.imageFront.length / 1024).toFixed(0)} KB` : 'N/A',
                backSize: record.imageBack ? `${(record.imageBack.length / 1024).toFixed(0)} KB` : 'N/A'
            });

            const w = window.open("", "_blank");
            w.document.open();

            const doc = w.document;
            const html = doc.documentElement;

            // Create head
            const head = doc.createElement('head');
            const title = doc.createElement('title');
            title.textContent = `Ficha de Registro - ${record.dni}`;
            const style = doc.createElement('style');
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
                body { font-family: 'Inter', sans-serif; padding: 40px; background: white; color: #333; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #667eea; padding-bottom: 20px; }
                .header h1 { margin: 0; color: #2d3748; font-size: 24px; }
                .header p { margin: 5px 0 0; color: #718096; }
                .content { display: flex; gap: 30px; }
                .info-section { flex: 1; }
                .images-section { flex: 1; display: flex; flex-direction: column; gap: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { color: #4a5568; font-weight: 600; width: 140px; }
                .img-container { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
                .img-container h3 { margin: 0 0 10px; font-size: 14px; color: #718096; }
                img { max-width: 100%; height: auto; border-radius: 4px; }
                .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            `;
            head.appendChild(title);
            head.appendChild(style);

            // Create body
            const body = doc.createElement('body');

            // Header
            const header = doc.createElement('div');
            header.className = 'header';
            header.innerHTML = `
                <h1>Ficha de Registro de Ciudadano</h1>
                <p>Escáner DNI SEMUJER</p>
            `;
            body.appendChild(header);

            // Content
            const content = doc.createElement('div');
            content.className = 'content';

            // Info Section
            const infoSection = doc.createElement('div');
            infoSection.className = 'info-section';
            infoSection.innerHTML = `
                <table>
                    <tr><th>DNI</th><td><strong>${record.dni}</strong></td></tr>
                    <tr><th>Nombre Completo</th><td>${record.fullname}</td></tr>
                    <tr><th>Sexo</th><td>${record.gender === 'M' ? 'Masculino' : 'Femenino'}</td></tr>
                    <tr><th>Fecha Nacimiento</th><td>${new Date(record.dob).toLocaleDateString()}</td></tr>
                    <tr><th>Edad</th><td>${record.age} años</td></tr>
                    <tr><th>Teléfono</th><td>${record.phone || 'No registrado'}</td></tr>
                    <tr><th>Departamento</th><td>${record.department || '-'}</td></tr>
                    <tr><th>Municipio</th><td>${record.municipality || '-'}</td></tr>
                    <tr><th>Fecha Registro</th><td>${new Date(record.date).toLocaleString()}</td></tr>
                </table>
            `;
            content.appendChild(infoSection);

            // Images Section
            const imagesSection = doc.createElement('div');
            imagesSection.className = 'images-section';

            if (record.imageFront) {
                const div = doc.createElement('div');
                div.className = 'img-container';
                div.innerHTML = `<h3>Frente</h3><img src="${record.imageFront}">`;
                imagesSection.appendChild(div);
            }
            if (record.imageBack) {
                const div = doc.createElement('div');
                div.className = 'img-container';
                div.innerHTML = `<h3>Reverso</h3><img src="${record.imageBack}">`;
                imagesSection.appendChild(div);
            }
            content.appendChild(imagesSection);
            body.appendChild(content);

            // Footer
            const footer = doc.createElement('div');
            footer.className = 'footer';
            footer.innerHTML = `<p>Generado el ${new Date().toLocaleString()}</p>`;
            body.appendChild(footer);

            // Print Script
            const script = doc.createElement('script');
            script.textContent = `
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 500);
                };
            `;
            body.appendChild(script);

            html.appendChild(head);
            html.appendChild(body);
            w.document.close();

        } catch (err) {
            console.error('Error printing record:', err);
            UIHelpers.showNotification('Error al imprimir ficha', 'error');
        }
    },

    deleteRecord: async (id) => {
        if (confirm("¿Está seguro de eliminar este registro?")) {
            try {
                await dbManager.deleteRecord(id);
                app.loadRecords();
            } catch (err) {
                console.error('Error deleting record:', err);
                alert(`Error al eliminar registro: ${err.message || err}`);
            }
        }
    },

    exportExcel: async () => {
        const records = await dbManager.getAllRecords();
        if (!records.length) { alert("No hay datos para exportar."); return; }

        const data = records.map(r => ({
            "Fecha Registro": new Date(r.date).toLocaleDateString(),
            "DNI": r.dni,
            "Nombre Completo": r.fullname,
            "Sexo": r.gender,
            "Fecha Nacimiento": r.dob,
            "Edad": r.age,
            "Rango Edad": r.ageRange,
            "Teléfono": r.phone,
            "Departamento": r.department,
            "Municipio": r.municipality
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Registros DNI");
        XLSX.writeFile(wb, "Registros_DNI_SEMUJER.xlsx");
    },

    exportPDF: async () => {
        const records = await dbManager.getAllRecords();
        if (!records.length) { alert("No hay datos para exportar."); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Reporte de Registros - Escáner DNI SEMUJER", 14, 22);
        doc.setFontSize(11);
        doc.text(`Fecha de reporte: ${new Date().toLocaleDateString()}`, 14, 30);

        const tableColumn = ["DNI", "Nombre", "Edad", "Sexo", "Teléfono", "Ubicación"];
        const tableRows = [];

        records.forEach(r => tableRows.push([r.dni, r.fullname, r.age, r.gender, r.phone, `${r.municipality}, ${r.department}`]));

        doc.autoTable({ head: [tableColumn], body: tableRows, startY: 40 });
        doc.save("Reporte_DNI_SEMUJER.pdf");
    },

    // ========== BACKUP Y RESTAURACIÓN ==========
    createBackup: async () => {
        try {
            const records = await dbManager.getAllRecords();

            if (!records.length) {
                UIHelpers.showNotification('No hay registros para respaldar', 'warning');
                return;
            }

            const backup = {
                version: "2.1",
                timestamp: new Date().toISOString(),
                totalRecords: records.length,
                data: records
            };

            const backupJson = JSON.stringify(backup, null, 2);
            const blob = new Blob([backupJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `backup_dni_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            UIHelpers.showNotification(`Respaldo creado: ${records.length} registros`, 'success');
        } catch (err) {
            console.error('Error creating backup:', err);
            UIHelpers.showNotification(`Error al crear respaldo: ${err.message}`, 'error');
        }
    },

    restoreBackup: async (file) => {
        try {
            if (!file) {
                UIHelpers.showNotification('Selecciona un archivo de respaldo', 'error');
                return;
            }

            if (!file.name.endsWith('.json')) {
                UIHelpers.showNotification('El archivo debe ser JSON', 'error');
                return;
            }

            const text = await file.text();
            const backup = JSON.parse(text);

            // Validaciones
            if (!backup.data || !Array.isArray(backup.data)) {
                UIHelpers.showNotification('Archivo de respaldo inválido: falta campo "data"', 'error');
                return;
            }

            if (!backup.version || !backup.timestamp) {
                UIHelpers.showNotification('Archivo de respaldo inválido: falta metadata', 'error');
                return;
            }

            // Confirmar antes de restaurar
            const confirmed = await new Promise(resolve => {
                UIHelpers.showConfirmation(
                    'Restaurar Respaldo',
                    `Se van a importar ${backup.data.length} registros.\n\n¿Deseas continuar?\n\nAdvertencia: Los registros existentes se mantienen, no se eliminan.`,
                    () => resolve(true),
                    () => resolve(false)
                );
            });

            if (!confirmed) return;

            // Restaurar datos
            let imported = 0;
            let duplicates = 0;
            const existingRecords = await dbManager.getAllRecords();
            const existingDnis = existingRecords.map(r => r.dni);

            for (const record of backup.data) {
                try {
                    // Validar que tenga campos requeridos
                    if (!record.dni || !record.fullname || !record.dob) {
                        continue;
                    }

                    // Evitar duplicados por DNI
                    if (existingDnis.includes(record.dni)) {
                        duplicates++;
                        continue;
                    }

                    // Agregar registro
                    await dbManager.addRecord(record);
                    imported++;
                    existingDnis.push(record.dni);
                } catch (err) {
                    console.error(`Error importing record ${record.dni}:`, err);
                }
            }

            // Actualizar interfaz
            app.loadRecords();

            // Mostrar resultado
            let message = `Importados: ${imported} registros`;
            if (duplicates > 0) {
                message += `\nDuplicados omitidos: ${duplicates}`;
            }
            UIHelpers.showNotification(message, 'success');

        } catch (err) {
            console.error('Error restoring backup:', err);
            if (err instanceof SyntaxError) {
                UIHelpers.showNotification('Error: El archivo JSON no es válido', 'error');
            } else {
                UIHelpers.showNotification(`Error al restaurar respaldo: ${err.message}`, 'error');
            }
        }
    },

    deleteAllRecords: async () => {
        try {
            const confirmed = await new Promise(resolve => {
                UIHelpers.showConfirmation(
                    'Eliminar Todos los Registros',
                    'Esto eliminará TODOS los registros de la base de datos.\n\nEsta acción NO se puede deshacer.\n\n¿Estás seguro?',
                    () => resolve(true),
                    () => resolve(false)
                );
            });

            if (!confirmed) return;

            // Segunda confirmación
            const confirmed2 = confirm('ÚLTIMA ADVERTENCIA: ¿Realmente deseas eliminar TODO?');
            if (!confirmed2) return;

            // Hacer backup automático antes de borrar
            try {
                const records = await dbManager.getAllRecords();
                if (records.length > 0) {
                    const backup = {
                        version: "2.1",
                        timestamp: new Date().toISOString(),
                        totalRecords: records.length,
                        data: records
                    };
                    const backupJson = JSON.stringify(backup, null, 2);
                    console.log('Backup automático creado antes de borrar todo');
                }
            } catch (err) {
                console.error('Error creating auto-backup:', err);
            }

            // Eliminar registros
            const records = await dbManager.getAllRecords();
            for (const record of records) {
                await dbManager.deleteRecord(record.id);
            }

            app.loadRecords();
            UIHelpers.showNotification('Todos los registros han sido eliminados', 'success');
        } catch (err) {
            console.error('Error deleting all records:', err);
            UIHelpers.showNotification(`Error: ${err.message}`, 'error');
        }
    },

    // QR Wrappers
    downloadQRCode: () => QRManager.downloadQRAsImage(),
    copyQRData: () => QRManager.copyQRDataToClipboard()
};

// Inicializar app
window.addEventListener('DOMContentLoaded', app.init);
