// QR Code Manager
const QRManager = {
    currentRecord: null,

    generateRecordQR: async (recordId) => {
        try {
            const records = await dbManager.getAllRecords();
            const record = records.find(r => r.id === recordId);

            if (!record) {
                UIHelpers.showNotification('Registro no encontrado', 'error');
                return;
            }

            QRManager.currentRecord = record;

            // Crear datos comprimidos para QR
            const qrData = {
                dni: record.dni,
                name: record.fullname,
                dob: record.dob,
                gender: record.gender,
                phone: record.phone,
                location: `${record.municipality}, ${record.department}`,
                date: record.date
            };

            const qrText = JSON.stringify(qrData);

            // Generar código QR
            UIHelpers.generateQRCode(qrText, 'qr-code-display');

            // Mostrar información del registro
            const infoText = `DNI: ${record.dni} | Nombre: ${record.fullname} | Edad: ${record.age || '-'} años`;
            document.getElementById('qr-record-info').textContent = infoText;

            // Abrir modal
            UIHelpers.openModal('qr-modal');

        } catch (err) {
            console.error('Error generating QR:', err);
            UIHelpers.showNotification(`Error al generar QR: ${err.message}`, 'error');
        }
    },

    downloadQRAsImage: () => {
        try {
            const canvas = document.querySelector('#qr-code-display canvas');
            if (!canvas) {
                UIHelpers.showNotification('Código QR no encontrado', 'error');
                return;
            }

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `qr_${QRManager.currentRecord?.dni || 'registro'}_${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            UIHelpers.showNotification('Código QR descargado', 'success');
        } catch (err) {
            console.error('Error downloading QR:', err);
            UIHelpers.showNotification(`Error al descargar QR: ${err.message}`, 'error');
        }
    },

    copyQRDataToClipboard: () => {
        try {
            if (!QRManager.currentRecord) {
                UIHelpers.showNotification('No hay registro cargado', 'error');
                return;
            }

            const qrData = {
                dni: QRManager.currentRecord.dni,
                name: QRManager.currentRecord.fullname,
                dob: QRManager.currentRecord.dob,
                gender: QRManager.currentRecord.gender,
                phone: QRManager.currentRecord.phone,
                location: `${QRManager.currentRecord.municipality}, ${QRManager.currentRecord.department}`,
                date: QRManager.currentRecord.date
            };

            const text = JSON.stringify(qrData, null, 2);
            navigator.clipboard.writeText(text).then(() => {
                UIHelpers.showNotification('Datos copiados al portapapeles', 'success');
            }).catch(() => {
                UIHelpers.showNotification('Error al copiar', 'error');
            });
        } catch (err) {
            console.error('Error copying QR data:', err);
            UIHelpers.showNotification(`Error: ${err.message}`, 'error');
        }
    }
};
