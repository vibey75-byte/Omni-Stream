// src/providers/vidzee/vidzee.ts

import { decryptVidzee, decryptUrl, decrypt } from './decrypt';  // تم إزالة .js
import type { VidzeeOptions, VidzeeResponse } from './vidzee.types';

export class VidzeeProvider {
    private options: VidzeeOptions;

    constructor(options?: VidzeeOptions) {
        this.options = options || {};
    }

    /**
     * فك تشفير البيانات
     */
    async decryptData(encryptedData: string | Buffer): Promise<string> {
        return decryptVidzee(encryptedData);
    }

    /**
     * فك تشفير الرابط
     */
    async getDecryptedUrl(encryptedUrl: string): Promise<string> {
        return decryptUrl(encryptedUrl);
    }

    /**
     * معالجة الفيديو
     */
    async processVideo(encryptedData: string | Buffer): Promise<VidzeeResponse> {
        try {
            const decrypted = await this.decryptData(encryptedData);
            
            return {
                success: true,
                data: decrypted,
                url: await this.getDecryptedUrl(decrypted)
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * دالة عامة لفك التشفير
     */
    decrypt(data: string | Buffer): string {
        return decrypt(data);
    }
}

// تصدير الدوال مباشرة للاستخدام السريع
export { decryptVidzee, decryptUrl, decrypt };
