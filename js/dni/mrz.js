/**
 * mrz.js - Lector MRZ para DNI Hondureño (TD1 - 3 líneas)
 * Compatible con navegador sin ES modules
 */

console.log("Cargando mrz.js para DNI Honduras...");

// ============================================================================
// FUNCIONES DE UTILIDAD MRZ
// ============================================================================

function fixMRZChars(str) {
    return str
        .toUpperCase()
        .replace(/ /g, '<')
        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/L/g, '1')
        .replace(/S/g, '5')
        .replace(/[^A-Z0-9<]/g, '<');
}

function mrzChecksum(str) {
    const weights = [7, 3, 1];
    const values = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<";

    let sum = 0;
    for (let i = 0; i < str.length; i++) {
        const val = values.indexOf(str[i]);
        if (val >= 0) sum += val * weights[i % 3];
    }
    return (sum % 10).toString();
}

function parseMRZDate(yymmdd) {
    if (!yymmdd || yymmdd.length !== 6) return '';
    const yy = parseInt(yymmdd.substring(0, 2), 10);
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    if (isNaN(yy)) return '';
    // Heurística: yy > 30 es 1900s, <= 30 es 2000s
    const year = (yy > 30) ? 1900 + yy : 2000 + yy;
    return `${year}-${mm}-${dd}`;
}

// ============================================================================
// PREPROCESAMIENTO DE IMAGEN
// ============================================================================

function preprocessImage(img) {
    return new Promise(resolve => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;

        // Binarización simple
        for (let i = 0; i < data.length; i += 4) {
            let v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            let b = v < 120 ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = b;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
    });
}

// ============================================================================
// PARSER MRZ HONDURAS TD1
// ============================================================================

function parseHondurasMRZ(lines) {
    if (lines.length !== 3) {
        console.warn("MRZ debe tener 3 líneas, recibidas:", lines.length);
    }

    const L1 = (lines[0] || '').padEnd(30, '<');
    const L2 = (lines[1] || '').padEnd(30, '<');
    const L3 = (lines[2] || '').padEnd(30, '<');

    // LÍNEA 1: I<HND + Apellidos<<Nombres
    const documentType = L1[0];
    const country = L1.substring(2, 5);
    const namesSection = L1.substring(5, 30);
    const parts = namesSection.split('<<');
    const surnames = (parts[0] || '').replace(/</g, ' ').trim();
    const names = (parts[1] || '').replace(/</g, ' ').trim();

    // LÍNEA 2: NumDoc(9)+Check(1)+Pais(3)+DOB(6)+Check(1)+Sex(1)+Exp(6)+Check(1)+Opt(2)
    const documentNumberRaw = L2.substring(0, 9);
    const documentNumber = documentNumberRaw.replace(/</g, '');
    const docDigit = L2[9];
    const nationality = L2.substring(10, 13);
    const birthRaw = L2.substring(13, 19);
    const birthDigit = L2[19];
    const sex = L2[20];
    const expiryRaw = L2.substring(21, 27);
    const expiryDigit = L2[27];

    // Validaciones checksum
    const docValid = mrzChecksum(documentNumberRaw) === docDigit;
    const birthValid = mrzChecksum(birthRaw) === birthDigit;
    const expiryValid = mrzChecksum(expiryRaw) === expiryDigit;

    if (!docValid) console.warn("⚠ Checksum documento inválido");
    if (!birthValid) console.warn("⚠ Checksum nacimiento inválido");
    if (!expiryValid) console.warn("⚠ Checksum expiración inválido");

    return {
        format: 'TD1',
        documentType,
        country,
        document_number: documentNumber,
        full_name: `${names} ${surnames}`.trim(),
        birth_date: parseMRZDate(birthRaw),
        sex: sex === '<' ? '' : sex,
        expiry_date: parseMRZDate(expiryRaw),
        nationality,
        surnames,
        names,
        // Validaciones
        document_number_valid: docValid,
        birth_date_valid: birthValid,
        expiry_date_valid: expiryValid,
        raw: lines
    };
}

// ============================================================================
// MRZ SCANNER CLASS
// ============================================================================

class MRZScanner {
    constructor() {
        this.worker = null;
    }

    async _getWorker() {
        if (this.worker) return this.worker;

        if (typeof Tesseract === 'undefined') {
            throw new Error("Tesseract.js no está disponible");
        }

        this.worker = await Tesseract.createWorker('eng', 1, {
            logger: m => console.log('[Tesseract]', m.status)
        });

        await this.worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
            preserve_interword_spaces: '0',
            tessedit_pageseg_mode: '6' // Bloque de texto uniforme
        });

        return this.worker;
    }

    async scanImage(dataUrl) {
        try {
            this._updateStatus("Cargando imagen...");

            // Convertir dataURL a Image element
            const img = await this._loadImage(dataUrl);

            this._updateStatus("Preprocesando...");
            const processedDataUrl = await preprocessImage(img);

            this._updateStatus("Analizando MRZ con OCR...");
            const worker = await this._getWorker();
            const { data: { text } } = await worker.recognize(processedDataUrl);

            console.log("OCR RAW:", text);

            // Limpiar y separar líneas
            let cleaned = fixMRZChars(text);
            console.log("OCR LIMPIO:", cleaned);

            let lines = cleaned
                .split("\n")
                .map(l => l.trim())
                .filter(l => l.length >= 25 && (l.match(/</g) || []).length >= 5);

            if (lines.length < 3) {
                throw new Error(`Solo se detectaron ${lines.length} líneas MRZ (se requieren 3)`);
            }

            // Tomar las primeras 3 líneas válidas
            lines = lines.slice(0, 3);
            console.log("MRZ DETECTADO:", lines);

            this._updateStatus("Parseando datos...");
            const parsed = parseHondurasMRZ(lines);

            // Determinar estado de validación
            const allValid = parsed.document_number_valid &&
                parsed.birth_date_valid &&
                parsed.expiry_date_valid;

            const someValid = parsed.document_number_valid ||
                parsed.birth_date_valid ||
                parsed.expiry_date_valid;

            return {
                validation: {
                    status: allValid ? 'OK' : (someValid ? 'PARTIAL' : 'ERROR'),
                    message: allValid ? '' : 'Algunos checksums fallaron'
                },
                data: parsed,
                parsed: parsed // Compatibilidad con app.js nuevo
            };

        } catch (error) {
            console.error("Error en scanImage:", error);
            return {
                validation: {
                    status: 'ERROR',
                    message: error.message || 'Error desconocido'
                },
                data: {},
                parsed: {}
            };
        }
    }

    _loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(new Error("Error cargando imagen: " + e));
            img.src = dataUrl;
        });
    }

    _updateStatus(msg) {
        try {
            const el = document.getElementById('status-text');
            if (el) el.innerText = msg;
        } catch (e) { }
        console.log('[MRZ STATUS]', msg);
    }
}

// ============================================================================
// EXPOSICIÓN GLOBAL
// ============================================================================

window.mrzScanner = new MRZScanner();
console.log("✓ mrzScanner inicializado y disponible globalmente");
