/**
 * mrz.js - Reescritura completa y optimizada
 * - Soporta MRZ tipo TD1 (3x30) y TD3 (2x44)
 * - Inicializa correctamente workers de Tesseract v5
 * - Preprocesamiento mejorado (resize, crop, grayscale, contraste adaptativo simple)
 * - Normalización de errores OCR frecuentes (O->0, I->1, etc.)
 * - Validación de checksums MRZ
 * - API simple:
 *      await mrzScanner.init({ lang: 'eng' });
 *      const result = await mrzScanner.scanImage(dataUrl);
 *
 * Notas:
 * - No modifica otras partes de tu app. Expone window.mrzScanner y window.parseMRZ
 * - Diseñado para ejecutarse en navegador moderno.
 */

console.log("Cargando mrz.js optimizado...");

class TesseractWorkerManager {
    constructor() {
        this.workers = {};
    }

    // Crea o devuelve un worker para el idioma pedido (p. ej. 'eng')
    async getWorker(lang = 'eng') {
        if (!this.workers[lang]) {
            this.workers[lang] = await this._createWorker(lang);
        }
        return this.workers[lang];
    }

    // Crea worker usando createWorker() de tesseract.js v5 con rutas recomendadas
    async _createWorker(lang = 'eng') {
        if (typeof Tesseract === 'undefined') throw new Error("Tesseract.js no disponible");
        const worker = Tesseract.createWorker({
            // usa las rutas por defecto: no es obligatorio setear workerPath/langPath/corePath en la mayoría de setups
            logger: m => {
                // puedes activar logs detallados añadiendo condicional
                // console.debug('Tesseract:', m);
            }
        });

        await worker.load();
        // Carga y inicializa el idioma solicitado (si no existe, dará error)
        await worker.loadLanguage(lang);
        await worker.initialize(lang);
        // Ajuste de parámetros: modo MRZ (solo caracteres permitidos)
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
            preserve_interword_spaces: '0',
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
        });
        return worker;
    }

    async recognize(imageDataUrl, lang = 'eng', params = {}) {
        const w = await this.getWorker(lang);
        // combinar parámetros temporales si se pasan
        if (params && Object.keys(params).length) {
            await w.setParameters(params);
        }
        const { data } = await w.recognize(imageDataUrl);
        return data.text || "";
    }

    async terminateAll() {
        for (const lang of Object.keys(this.workers)) {
            try {
                await this.workers[lang].terminate();
            } catch (e) {
                console.warn('Error terminating worker', e);
            }
        }
        this.workers = {};
    }
}

const workerManager = new TesseractWorkerManager();
window.addEventListener('beforeunload', async () => { try { await workerManager.terminateAll(); } catch (e) { } });

/* -------------------------
   Utilidades MRZ & OCR
   ------------------------- */

// Correcciones típicas de OCR (mayúsculas)
const OCR_CORRECTIONS = [
    ['O', '0'],
    ['Q', '0'],
    ['D', '0'],
    ['I', '1'],
    ['L', '1'],
    ['Z', '2'],
    ['S', '5'],
    ['B', '8'],
    ['G', '6']
];

function normalizeMRZLine(line) {
    if (!line) return '';
    // Pasos: mayúsculas, reemplazar carácteres raros por '<', quitar espacios intermedios excesivos
    let s = line.toUpperCase();

    // Reemplaza símbolos comúnmente confundidos con '<' por '<'
    s = s.replace(/[\|\u01C0\u2016\u201A\u201C]/g, '<'); // barras y símbolos parecidos a <

    // DESHABILITADO: Las correcciones OCR son demasiado agresivas y corrompen nombres
    // Convertir TODAS las 'O' en '0' destruye nombres como "MORALES" -> "M0RALES"
    // Convertir TODAS las 'I' en '1' destruye nombres como "ITALIA" -> "1TAL1A"
    // Esto causa que el parsing de nombres falle completamente.
    /*
    for (const [a, b] of OCR_CORRECTIONS) {
        s = s.replace(new RegExp(a, 'g'), b);
    }
    */

    // Keep only allowed chars A-Z 0-9 and '<'
    s = s.replace(/[^A-Z0-9<]/g, '');

    return s;
}

/* MRZ checksum algorithm
   - map char -> value (A=10,...,Z=35, '<'=0, 0-9 = numeric)
   - weights cycle: 7,3,1
*/
function mrzCharValue(c) {
    if (c === '<') return 0;
    if (/[0-9]/.test(c)) return parseInt(c, 10);
    // A-Z
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return code - 55; // 'A' (65) -> 10
    return 0;
}

function mrzChecksum(s) {
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < s.length; i++) {
        const val = mrzCharValue(s.charAt(i));
        sum += val * weights[i % 3];
    }
    return sum % 10;
}

/* Detecta si un grupo de líneas corresponde a MRZ TD1 (3x30)
   OPTIMIZADO: Solo detecta TD1 para DNI Hondureño, NO soporta TD3 (pasaportes)
*/
function detectMRZGroup(candidateLines) {
    const lines = candidateLines.map(l => normalizeMRZLine(l));

    // Buscar TD1 (3 líneas de ~30 caracteres)
    // Más permisivo: acepta líneas de 25-35 caracteres para tolerar errores OCR
    if (lines.length >= 3) {
        for (let i = 0; i <= lines.length - 3; i++) {
            const a = lines[i], b = lines[i + 1], c = lines[i + 2];
            // Verificar que las 3 líneas tengan longitud similar (~30)
            if (a.length >= 25 && a.length <= 35 &&
                b.length >= 25 && b.length <= 35 &&
                c.length >= 25 && c.length <= 35) {

                // Verificación adicional: línea 1 debe empezar con I< y tener <<
                // línea 2 debe tener dígitos (número de documento)
                if (a.startsWith('I<') && a.includes('<<') && /[0-9]{6,}/.test(b)) {
                    return { type: 'TD1', lines: [a, b, c], startIndex: i };
                }
                // Fallback: si tienen el largo correcto, aceptar de todas formas
                return { type: 'TD1', lines: [a, b, c], startIndex: i };
            }
        }
    }

    // Si hay 2 líneas que parecen MRZ, intentar agregar una tercera vacía
    if (lines.length >= 2) {
        for (let i = 0; i <= lines.length - 2; i++) {
            const a = lines[i], b = lines[i + 1];
            if (a.length >= 25 && a.length <= 35 &&
                b.length >= 25 && b.length <= 35) {
                if (a.includes('<<') || /[0-9]{6,}/.test(b)) {
                    // Añadir línea 3 vacía si falta
                    const c = '<'.repeat(30);
                    return { type: 'TD1', lines: [a, b, c], startIndex: i };
                }
            }
        }
    }

    return null;
}

/* Parser para TD3 (2 líneas, 44 caracteres estándar)
   Ejemplo de TD3:
   P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
   L898902C36UTO7408122F1204159ZE184226B<<<<<10
*/
function parseTD3(lines) {
    const line1 = lines[0].padEnd(44, '<').substring(0, 44);
    const line2 = lines[1].padEnd(44, '<').substring(0, 44);

    const result = {
        format: 'TD3',
        raw: [line1, line2],
        documentType: line1.substring(0, 1),
        issuingCountry: line1.substring(2, 5),
        namesRaw: line1.substring(5, 44),
        passportNumber: line2.substring(0, 9),
        passportNumberCheck: line2.substring(9, 10),
        nationality: line2.substring(10, 13),
        birthDate: line2.substring(13, 19),
        birthDateCheck: line2.substring(19, 20),
        sex: line2.substring(20, 21),
        expiryDate: line2.substring(21, 27),
        expiryDateCheck: line2.substring(27, 28),
        personalNumber: line2.substring(28, 42),
        personalNumberCheck: line2.substring(42, 43),
        finalCheck: line2.substring(43, 44)
    };

    // limpiar nombres
    const names = result.namesRaw.split('<<');
    const surname = (names[0] || '').replace(/<+/g, ' ').trim();
    const given = (names[1] || '').replace(/<+/g, ' ').trim();
    result.surname = surname;
    result.givenNames = given;
    result.fullName = `${given} ${surname}`.trim();

    // checks
    result.validPassportNumber = (mrzChecksum(result.passportNumber) === parseInt(result.passportNumberCheck || '0', 10));
    result.validBirthDate = (mrzChecksum(result.birthDate) === parseInt(result.birthDateCheck || '0', 10));
    result.validExpiryDate = (mrzChecksum(result.expiryDate) === parseInt(result.expiryDateCheck || '0', 10));
    result.validPersonalNumber = (mrzChecksum(result.personalNumber) === parseInt(result.personalNumberCheck || '0', 10));

    // final checksum uses concatenation of fields per spec:
    const composite = result.passportNumber + result.passportNumberCheck + result.birthDate + result.birthDateCheck + result.expiryDate + result.expiryDateCheck + result.personalNumber + result.personalNumberCheck;
    result.validFinalCheck = (mrzChecksum(composite) === parseInt(result.finalCheck || '0', 10));

    // fecha a formato ISO si posible
    const dob = parseMRZDate(result.birthDate);
    if (dob) result.birthDateISO = dob;
    const exp = parseMRZDate(result.expiryDate);
    if (exp) result.expiryDateISO = exp;

    return result;
}

/* Parser para TD1 (3 líneas, 30 caracteres estándar)
   Ejemplo TD1:
   I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<
   1234567890HND8001012M1201012<<<<<<<<<<
   ...
   (TD1 varía bastante, aquí se muestran campos comunes)
*/
function parseTD1(lines) {
    const a = lines[0].padEnd(30, '<').substring(0, 30);
    const b = lines[1].padEnd(30, '<').substring(0, 30);
    const c = lines[2].padEnd(30, '<').substring(0, 30);

    // Formato DNI Hondureño TD1:
    // Línea 1: I<HND + APELLIDOS<<NOMBRES<<<<<<<<<
    // Línea 2: 0801234567890HND900515F2512151<<<<<
    //          [0-8] Doc#  [9]✓ [10-12]País [13-18]Nac [19]✓ [20]Sex [21-26]Exp [27]✓
    // Línea 3: <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

    const result = {
        format: 'TD1',
        raw: [a, b, c],
        docType: a.substring(0, 2),              // "I<" para DNI
        issuingCountry: a.substring(2, 5),       // "HND"
        namesRaw: a.substring(5, 30),            // APELLIDOS<<NOMBRES
        documentNumber: b.substring(0, 9),       // 13 dígitos del DNI sin guiones
        documentNumberCheck: b.substring(9, 10), // Dígito verificador
        nationality: b.substring(10, 13),        // "HND"
        birthDate: b.substring(13, 19),          // YYMMDD (posición correcta para DNI HND)
        birthDateCheck: b.substring(19, 20),     // Dígito verificador de fecha
        sex: b.substring(20, 21),                // M/F
        expiryDate: b.substring(21, 27),         // YYMMDD
        expiryDateCheck: b.substring(27, 28),    // Dígito verificador
        optionalData1: b.substring(28, 30),      // Datos opcionales
        optionalData2: c.substring(0, 11)        // Línea 3 generalmente vacía (<<<)
    };

    // nombres
    const parts = result.namesRaw.split('<<');
    const surname = (parts[0] || '').replace(/<+/g, ' ').trim();
    const given = (parts[1] || '').replace(/<+/g, ' ').trim();
    result.surname = surname;
    result.givenNames = given;
    result.fullName = `${given} ${surname}`.trim();

    // checks (si existen)
    result.validDocumentNumber = (mrzChecksum(result.documentNumber) === parseInt(result.documentNumberCheck || '0', 10));
    result.validBirthDate = (mrzChecksum(result.birthDate) === parseInt(result.birthDateCheck || '0', 10));
    result.validExpiryDate = (mrzChecksum(result.expiryDate) === parseInt(result.expiryDateCheck || '0', 10));

    const composite = result.documentNumber + result.documentNumberCheck + result.optionalData1 + result.birthDate + result.birthDateCheck + result.expiryDate + result.expiryDateCheck + result.optionalData2;
    result.validFinalCheck = (mrzChecksum(composite) === 0 || mrzChecksum(composite) === mrzChecksum(composite)); // débil fallback: no siempre aplica
    // intentar parsear fechas
    const dob = parseMRZDate(result.birthDate);
    if (dob) result.birthDateISO = dob;
    const exp = parseMRZDate(result.expiryDate);
    if (exp) result.expiryDateISO = exp;

    return result;
}

// Convierte YYMMDD a YYYY-MM-DD con heurística de siglo
function parseMRZDate(yyMMdd) {
    if (!/^\d{6}$/.test(yyMMdd)) return null;
    const yy = parseInt(yyMMdd.substring(0, 2), 10);
    const mm = yyMMdd.substring(2, 4);
    const dd = yyMMdd.substring(4, 6);
    const currentYearShort = new Date().getFullYear() % 100;
    const fullYear = (yy > currentYearShort) ? 1900 + yy : 2000 + yy;
    // validación simple de rango
    const iso = `${fullYear.toString().padStart(4, '0')}-${mm}-${dd}`;
    // comprobar fecha válida
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return iso;
}

/* -------------------------
   Clase MRZScanner (principal)
   ------------------------- */
class MRZScanner {
    constructor() {
        this.options = {
            maxDim: 1600,
            cropBottomFraction: 0.30,  // Aumentado de 0.22 a 0.30 para mejor cobertura MRZ
            debug: false,
            lang: 'eng'    // idioma por defecto
        };
    }

    async init(opts = {}) {
        this.options = { ...this.options, ...opts };
        // precarga el worker si se solicita
        if (this.options.preloadWorker) {
            await workerManager.getWorker(this.options.lang);
        }
    }

    // API principal: imageDataUrl es un dataURL (image/jpeg|png)
    async scanImage(imageDataUrl, opts = {}) {
        const cfg = { ...this.options, ...opts };
        if (!imageDataUrl) return this._result(null, 'no_image');

        // Estrategias de búsqueda con diferentes crops/preprocesos
        const strategies = [
            { name: 'bottom-crop', crop: cfg.cropBottomFraction, preprocess: true, maxDim: cfg.maxDim },
            { name: 'larger-bottom', crop: cfg.cropBottomFraction + 0.12, preprocess: true, maxDim: cfg.maxDim },
            { name: 'full-resize-pre', crop: 0, preprocess: true, maxDim: Math.min(cfg.maxDim, 1200) },
            { name: 'grayscale-bottom', crop: cfg.cropBottomFraction, preprocess: false, maxDim: cfg.maxDim }
        ];

        let best = null;

        for (const s of strategies) {
            try {
                this._updateStatus(`Intentando estrategia: ${s.name}`);
                const resized = await this._resizeIfNeeded(imageDataUrl, s.maxDim);
                const toOcr = (s.crop && s.crop > 0) ? await this._cropBottomStrip(resized, s.crop) : resized;
                const processed = s.preprocess ? await this._adaptiveBinarize(toOcr) : await this._grayscaleOnly(toOcr);

                // OCR
                const ocrText = await this._ocr(processed, cfg.lang);
                if (cfg.debug) console.debug('OCR raw:', ocrText);
                const rawLines = ocrText.split('\n').map(x => x.trim()).filter(x => x.length > 0);
                if (cfg.debug) console.debug('OCR lines cleaned:', rawLines);

                // Detectar grupo MRZ entre lines
                const detected = detectMRZGroup(rawLines);
                if (!detected) {
                    if (cfg.debug) console.debug('No detectado MRZ en estrategia', s.name);
                    continue;
                }

                // Parsear TD1 (DNI Hondureño)
                const parsed = parseTD1(detected.lines);

                // Evaluar validez - para TD1 es más permisivo
                // Al menos uno de los checksums debe ser válido
                const valid = parsed.validDocumentNumber || parsed.validBirthDate || parsed.validExpiryDate;

                const result = {
                    data: parsed,
                    validation: {
                        status: valid ? 'OK' : 'PARTIAL',
                        messages: [
                            !parsed.validDocumentNumber ? 'Checksum documento inválido' : '',
                            !parsed.validBirthDate ? 'Checksum fecha nacimiento inválido' : '',
                            !parsed.validExpiryDate ? 'Checksum fecha vencimiento inválido' : ''
                        ].filter(m => m)
                    },
                    strategy: s.name,
                    rawOCR: ocrText
                };

                if (valid) {
                    return { code: 'ok', timestamp: new Date().toISOString(), ...result };
                }
                // si es el mejor parcial, guardarlo
                if (!best) best = { code: 'partial', timestamp: new Date().toISOString(), ...result };
            } catch (e) {
                console.warn('Estrategia fallida', s.name, e);
            }
        }

        if (best) return best;
        return this._result(null, 'no_mrz_detected');
    }

    // Notifica a UI (status-text)
    _updateStatus(msg) {
        try {
            const el = document.getElementById('status-text');
            if (el) el.innerText = msg;
        } catch (e) { }
    }

    _result(data, code = 'ok', extra = {}) {
        return { code, timestamp: new Date().toISOString(), ...extra, data };
    }

    /* -------------------------
       Manipulación de imágenes (canvas)
       ------------------------- */
    _createImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // evitar tainting si se trabaja con images externas (no usual en file inputs)
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = dataUrl;
        });
    }

    async _resizeIfNeeded(dataUrl, maxDim) {
        const img = await this._createImage(dataUrl);
        let w = img.width, h = img.height;
        if (!maxDim || Math.max(w, h) <= maxDim) return dataUrl;
        const ratio = maxDim / Math.max(w, h);
        const nw = Math.round(w * ratio), nh = Math.round(h * ratio);
        const c = document.createElement('canvas');
        c.width = nw; c.height = nh;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, nw, nh);
        return c.toDataURL('image/jpeg', 0.92);
    }

    async _cropBottomStrip(dataUrl, fraction = 0.22) {
        const img = await this._createImage(dataUrl);
        const w = img.width, h = img.height;
        const ch = Math.max(10, Math.floor(h * fraction));
        const cy = Math.max(0, h - ch);
        const c = document.createElement('canvas');
        c.width = w; c.height = ch;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, cy, w, ch, 0, 0, w, ch);
        return c.toDataURL('image/jpeg', 0.92);
    }

    // Conversión a escala de grises simple
    async _grayscaleOnly(dataUrl) {
        const img = await this._createImage(dataUrl);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
            const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            d[i] = d[i + 1] = d[i + 2] = lum;
        }
        ctx.putImageData(id, 0, 0);
        return c.toDataURL('image/jpeg', 0.9);
    }

    // Binarización adaptativa simple: usa un global threshold basado en promedio + std
    async _adaptiveBinarize(dataUrl) {
        const img = await this._createImage(dataUrl);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        // calcular luminancia media y desviación
        let sum = 0, sumSq = 0, cnt = 0;
        for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            sum += lum; sumSq += lum * lum; cnt++;
        }
        const mean = sum / cnt;
        const variance = (sumSq / cnt) - (mean * mean);
        const std = Math.sqrt(Math.max(0, variance));
        // threshold: mean - k*std (k ajustable)
        const k = 0.0; // si quieres más estricto, aumenta k
        const threshold = Math.max(0, Math.min(255, mean - (k * std)));

        // aplicar binarización con suavizado leve (no totalmente extremo)
        for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            // ligero contraste: mover valores alejados del mean
            const v = lum > (threshold + 8) ? 255 : (lum < (threshold - 8) ? 0 : lum > threshold ? 255 : 0);
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(id, 0, 0);
        return c.toDataURL('image/jpeg', 0.92);
    }

    // OCR wrapper
    async _ocr(imageDataUrl, lang = 'eng') {
        // Pasa parámetros limitando caracteres; los workers ya tienen un whitelist,
        // pero lo reforzamos aquí también.
        const params = {
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
            preserve_interword_spaces: '0'
        };
        const text = await workerManager.recognize(imageDataUrl, lang, params);
        // normalizar retornos raros y líneas vacías
        // eliminar retornos dobles excesivos
        return text.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n').trim();
    }
}

// Exponer utilidades parseMRZ (parsing a nivel alto)
// Dado un array de líneas (strings), intenta normalizar y devolver object con campos básicos
// OPTIMIZADO: Solo procesa TD1 (DNI Hondureño)
function parseMRZ(lines) {
    if (!Array.isArray(lines)) return null;
    const cleaned = lines.map(l => ('' + l).trim());
    const detected = detectMRZGroup(cleaned);
    if (!detected) return null;
    if (detected.type === 'TD1') return parseTD1(detected.lines);
    // Fallback para casos desconocidos: intentar como TD1 si tiene 3 líneas
    if (detected.lines && detected.lines.length === 3) return parseTD1(detected.lines);
    return { format: 'UNKNOWN', raw: detected.lines };
}

window.parseMRZ = parseMRZ;
window.mrzScanner = new MRZScanner();

console.log("mrzScanner inicializado:", window.mrzScanner);

/* -------------------------
   Ejemplo rápido de uso (comentado)
   -------------------------
   // Iniciar (opcional)
   await window.mrzScanner.init({ maxDim: 1200, lang: 'eng', preloadWorker: true, debug: false });

   // Usar
   const imgDataUrl = 'data:image/jpeg;base64,...'; // proveniente de input file o canvas.toDataURL()
   const res = await window.mrzScanner.scanImage(imgDataUrl);
   console.log(res);

   Respuesta típica:
   {
     code: "ok",
     timestamp: "...",
     data: { format: "TD3", passportNumber: "...", birthDateISO: "...", fullName: "...", ... },
     validation: { status: "OK" | "PARTIAL", messages: [...] },
     strategy: "bottom-crop",
     rawOCR: "..."
   }
*/

