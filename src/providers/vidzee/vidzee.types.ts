// src/providers/vidzee/vidzee.types.ts

export interface VidzeeOptions {
    apiKey?: string;
    timeout?: number;
    retries?: number;
}

export interface VidzeeResponse {
    success: boolean;
    data?: string;
    url?: string;
    error?: string;
}

export interface VidzeeVideoInfo {
    id: string;
    title: string;
    sources: string[];
    subtitles?: string[];
}
