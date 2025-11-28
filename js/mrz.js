console.log("Cargando mrz.js...");

class TesseractWorkerManager {
    constructor() { this.workers = {}; }
    async getWorker(lang = 'eng') {
        if (!this.workers[lang]) {
            this.workers[lang] = await this._createWorker(lang);
        }
        return this.workers[lang];
    }
    async _createWorker(lang) {
        if (typeof Tesseract === 'undefined') throw new Error("Tesseract.js no disponible");
        const w = await Tesseract.createWorker({
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
            langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-data@1.0.0/4.0.0_best',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js'
        });
        await w.load(); await w.loadLanguage(lang); await w.initialize(lang);
        return w;
    }
    async recognize(imageUrl, lang = 'eng', params = {}) {
        const w = await this.getWorker(lang);
        await w.setParameters(params);
        const { data } = await w.recognize(imageUrl);
        return data.text || "";
    }
    async terminateAll() {
        for (const [lang, w] of Object.entries(this.workers)) {
            try { await w.terminate(); } catch (e) { console.error('Error terminating:', e); }
        }
        this.workers = {};
    }
}

const workerManager = new TesseractWorkerManager();
window.addEventListener('beforeunload', async () => { await workerManager.terminateAll(); });


// --- CÓDIGO PROPORCIONADO POR EL USUARIO ---
function parseMRZ(lines) {
    // Limpieza preliminar de líneas: quitar espacios y caracteres extraños del inicio/final
    const cleanLines = lines.map(l => l.replace(/ /g, '').toUpperCase().replace(/^[^A-Z0-9<]+|[^A-Z0-9<]+$/g, ''));

    let line1Idx = -1;
    let line3Idx = -1;

    // Buscar Línea 1 (I<HND...) y Línea 3 (Nombres con <<)
    for (let i = 0; i < cleanLines.length; i++) {
        const line = cleanLines[i];
        // Línea 1: Contiene HND y empieza por I< o 1< o |< (ajustado por limpieza)
        if (line.includes('HND') && (line.startsWith('I<') || line.startsWith('1<') || line.startsWith('|<'))) {
            line1Idx = i;
        }
        // Línea 3: Contiene << (separador de apellidos y nombres)
        if (line.includes('<<') && line.length > 10) {
            line3Idx = i;
        }
    }

    if (line1Idx === -1) return null;

    // Intentar deducir Línea 2
    let line2Idx = -1;

    // Si tenemos Línea 1 y Línea 3, la Línea 2 debería estar en medio
    if (line3Idx > line1Idx) {
        // Buscar entre line1 y line3 la mejor candidata para line2 (empieza con números)
        for (let i = line1Idx + 1; i < line3Idx; i++) {
            if (cleanLines[i].length > 8 && /^[0-9OIZS]/.test(cleanLines[i])) {
                line2Idx = i;
                break;
            }
        }
    } else {
        // Si no encontramos línea 3, asumimos que la siguiente a la 1 es la 2
        if (line1Idx + 1 < cleanLines.length) line2Idx = line1Idx + 1;
    }

    // Si no encontramos línea 2 explícitamente pero hay espacio, forzamos la siguiente
    if (line2Idx === -1 && line1Idx + 1 < cleanLines.length && (line3Idx === -1 || line1Idx + 1 !== line3Idx)) {
        line2Idx = line1Idx + 1;
    }

    if (line2Idx === -1) return null;

    const line2 = cleanLines[line2Idx];
    const line3 = (line3Idx !== -1) ? cleanLines[line3Idx] : '';

    console.log("Line 1:", cleanLines[line1Idx]);
    console.log("Line 2:", line2);
    console.log("Line 3:", line3);

    // Parsear Línea 2 (DOB y Sexo)
    let dobStr = line2.substring(0, 6)
        .replace(/O/g, '0').replace(/I/g, '1').replace(/Z/g, '2')
        .replace(/S/g, '5').replace(/B/g, '8').replace(/D/g, '0');

    let formattedDob = '';
    if (/^\d{6}$/.test(dobStr)) {
        const year = parseInt(dobStr.substring(0, 2));
        const month = dobStr.substring(2, 4);
        const day = dobStr.substring(4, 6);
        const currentYearShort = new Date().getFullYear() % 100;
        const fullYear = (year > currentYearShort) ? `19${year}` : `20${year}`;
        formattedDob = `${fullYear}-${month}-${day}`;
    }

    // Sexo
    let sexChar = '';
    if (line2.length > 7) {
        sexChar = line2.charAt(7);
        if (!['M', 'F'].includes(sexChar)) {
            if (['M', 'F'].includes(line2.charAt(6))) sexChar = line2.charAt(6);
            else if (['M', 'F'].includes(line2.charAt(8))) sexChar = line2.charAt(8);
        }
    }

    // Parsear Línea 3 (Nombres)
    let fullName = '';
    if (line3) {
        const cleanLine3 = line3.replace(/^[^A-Z<]+/, '');
        const parts = cleanLine3.split('<<');
        if (parts.length >= 1) {
            const surnames = parts[0].replace(/</g, ' ').trim();
            const givenNames = parts.length > 1 ? parts[1].replace(/</g, ' ').trim() : '';
            fullName = `${givenNames} ${surnames}`.trim();
        } else {
            fullName = cleanLine3.replace(/</g, ' ').trim();
        }
    }

    // --- ADAPTACIÓN: Extraer DNI ---
    let document_number = null;
    const line1 = cleanLines[line1Idx];
    const hndMatch = line1.match(/HND([A-Z0-9<]+)/);
    if (hndMatch) {
        const potentialId = hndMatch[1].split('<')[0];
        const cleanedId = potentialId.replace(/O/g, '0').replace(/I/g, '1').replace(/Z/g, '2').replace(/B/g, '8').replace(/S/g, '5');
        if (cleanedId.length >= 9) document_number = cleanedId;
    }
    if (!document_number) {
        const digitMatch = line1.match(/\d{9,13}/);
        if (digitMatch) document_number = digitMatch[0];
    }

    return {
        dob: formattedDob,
        sex: sexChar,
        fullName: fullName,
        document_number: document_number,
        birth_date: formattedDob,
        full_name: fullName,
        raw_lines: [cleanLines[line1Idx], line2, line3]
    };
}
window.parseMRZ = parseMRZ;

// --- CLASE MRZScanner ---
class MRZScanner {
    constructor() {
        this.options = {
            maxDim: 1600,
            cropMRZ: true,
            mrzCropFraction: 0.20,
            debug: false
        };
    }

    async init(opts = {}) {
        this.options = { ...this.options, ...opts };
    }

    async scanImage(imageData, opts = {}) {
        const cfg = { ...this.options, ...opts };
        if (!imageData) return this._result(null, "no_image");

        const strategies = [
            { name: "Standard (Bottom 20%)", crop: 0.20, preprocess: true },
            { name: "Expanded (Bottom 35%)", crop: 0.35, preprocess: true },
            { name: "Full Image", crop: 0, preprocess: true, maxDim: 1000 },
            { name: "Raw (Bottom 25%)", crop: 0.25, preprocess: false }
        ];

        let bestResult = null;

        for (const strategy of strategies) {
            try {
                this._updateStatus(`Intentando: ${strategy.name}...`);

                const maxDim = strategy.maxDim || cfg.maxDim;
                const resized = await this._resizeIfNeeded(imageData, maxDim);

                let toOcr = resized;
                if (strategy.crop > 0) {
                    toOcr = await this._cropBottomStrip(resized, strategy.crop);
                }

                if (strategy.preprocess) {
                    toOcr = await this._preprocessImage(toOcr);
                } else {
                    toOcr = await this._grayscaleOnly(toOcr);
                }

                const ocrText = await this._ocr(toOcr, cfg);
                const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
                const parsed = window.parseMRZ(lines);

                if (parsed) {
                    const isValid = parsed.document_number && parsed.birth_date && parsed.full_name;
                    const result = {
                        data: parsed,
                        validation: {
                            validation_status: isValid ? "OK" : "PARTIAL",
                            messages: isValid ? [] : ["Lectura parcial"]
                        },
                        strategy: strategy.name
                    };

                    if (isValid) return result;
                    if (!bestResult) bestResult = result;
                }

            } catch (err) {
                console.warn(`Strategy ${strategy.name} failed:`, err);
            }
        }

        if (bestResult) return bestResult;
        return this._result(null, "no_mrz_detected");
    }

    _updateStatus(msg) {
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.innerText = msg;
    }

    _result(data, code = "ok", extra = {}) {
        return { code, timestamp: new Date().toISOString(), ...extra, data };
    }

    _createImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = dataUrl;
        });
    }

    async _resizeIfNeeded(dataUrl, maxDim) {
        const img = await this._createImage(dataUrl);
        let w = img.width, h = img.height;
        if (Math.max(w, h) <= maxDim) return dataUrl;
        const ratio = maxDim / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/jpeg', 0.92);
    }

    async _cropBottomStrip(dataUrl, fraction = 0.20) {
        const img = await this._createImage(dataUrl);
        const w = img.width, h = img.height;
        const ch = Math.max(1, Math.floor(h * fraction));
        const cy = Math.max(0, h - ch);
        const c = document.createElement('canvas');
        c.width = w; c.height = ch;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, cy, w, ch, 0, 0, w, ch);
        return c.toDataURL('image/jpeg', 0.92);
    }

    async _preprocessImage(dataUrl) {
        const img = await this._createImage(dataUrl);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const idata = ctx.getImageData(0, 0, c.width, c.height);
        const data = idata.data;
        for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const val = lum < 128 ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = val;
        }
        ctx.putImageData(idata, 0, 0);
        return c.toDataURL('image/jpeg', 0.9);
    }

    async _grayscaleOnly(dataUrl) {
        const img = await this._createImage(dataUrl);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const idata = ctx.getImageData(0, 0, c.width, c.height);
        const data = idata.data;
        for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = lum;
        }
        ctx.putImageData(idata, 0, 0);
        return c.toDataURL('image/jpeg', 0.9);
    }

    async _ocr(imageDataUrl, cfg = {}) {
        const params = { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' };
        return await workerManager.recognize(imageDataUrl, 'eng', params);
    }
}

// Asignación global explícita
window.mrzScanner = new MRZScanner();
console.log("mrzScanner inicializado:", window.mrzScanner);
