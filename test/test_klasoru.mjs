// Eski senaryo testlerinin (senaryo1–12) okuduğu örnek PDF klasörü. Kişisel yol koda yazılmaz: PDEFE_TEST_PDF_KLASORU
// verilmezse testi çalıştıran kullanıcının Masaüstü\PDF DENEME klasörü (os.homedir()) kullanılır. D her zaman / ile biter.
import os from 'node:os';
import path from 'node:path';

export const D = (process.env.PDEFE_TEST_PDF_KLASORU || path.join(os.homedir(), 'Desktop', 'PDF DENEME')).replace(/\\/g, '/').replace(/\/?$/, '/');
