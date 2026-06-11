import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult
} from '@omss/framework';
import type { VideasyServer } from './videasy.types.js';
import { decryptResponse } from './decryptor.js';

const VIDEASY_SERVERS: readonly VideasyServer[] = [
    {
        name: 'cuevana',
        url: 'https://api2.videasy.net/cuevana/sources-with-title',
        language: 'english'
    },
    {
        name: 'mb-flix',
        url: 'https://api.videasy.net/mb-flix/sources-with-title',
        language: 'english'
    },
    {
        name: '1movies',
        url: 'https://api.videasy.net/1movies/sources-with-title',
        language: 'english'
    },
    {
        name: 'cdn',
        url: 'https://api.videasy.net/cdn/sources-with-title',
        language: 'english'
    },
    {
        name: 'superflix',
        url: 'https://api.videasy.net/superflix/sources-with-title',
        language: 'english'
    },
    {
        name: 'lamovie',
        url: 'https://api.videasy.net/lamovie/sources-with-title',
        language: 'english'
    }
] as const;

export class VideasyProvider extends BaseProvider {
    readonly id = 'Videasy';
    readonly name = 'Videasy';
    readonly enabled = true;
    readonly BASE_URL = 'https://api.videasy.net';
    readonly HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, */*; q=0.01',
        Referer: 'https://player.videasy.net/',
        Origin: 'https://player.videasy.net'
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    private async getSources(
        media: ProviderMediaObject
    ): Promise<ProviderResult> {
        const results = await Promise.allSettled(
            VIDEASY_SERVERS.map((server) => this.fetchFromServer(server, media))
        );

        const sources: ProviderResult['sources'] = [];
        const subtitles: ProviderResult['subtitles'] = [];
        const diagnostics: ProviderResult['diagnostics'] = [];
        let failCount = 0;

        for (const result of results) {
            if (result.status === 'rejected' || !result.value) {
                failCount++;
                continue;
            }
            sources.push(...result.value.sources);
            subtitles.push(...result.value.subtitles);
        }

        if (failCount > 0 && sources.length > 0) {
            diagnostics.push({
                code: 'PARTIAL_SCRAPE',
                message: `${failCount} of ${VIDEASY_SERVERS.length} videasy servers did not return results`,
                field: '',
                severity: 'warning'
            });
        }

        if (sources.length === 0) {
            return this.emptyResult('all videasy servers returned no sources', media);
        }

        return { sources, subtitles, diagnostics };
    }

    private async fetchFromServer(
        server: VideasyServer,
        media: ProviderMediaObject
    ): Promise<ProviderResult | null> {
        const params = this.buildParams(server, media);
        const url = `${server.url}?${new URLSearchParams(params as Record<string, string>)}`;
        const response = await fetch(url, { headers: this.HEADERS });

        if (!response.ok) {
            return this.emptyResult('invalid response', media);
        }

        const blob = await response.text();

        if (!blob || blob.length < 10) {
            return this.emptyResult('INVALID RESPONSE', media);
        }

        const decrypted = await decryptResponse(blob, String(media.tmdbId));

        if (!decrypted || decrypted.sources.length === 0) {
            return this.emptyResult('Unable to Decode', media);
        }

        const sources: ProviderResult['sources'] = decrypted.sources
            .filter((s) => !!s?.url)
            .map((s) => ({
                url: this.createProxyUrl(s.url, this.HEADERS),
                type: this.detectType(s.url, s.type),
                quality: this.normalizeQuality(s.quality),
                audioTracks: [
                    {
                        language: this.resolveLanguage(server),
                        label: this.resolveLanguageLabel(server)
                    }
                ],
                provider: { id: this.id, name: this.name }
            }));

        const subtitles: ProviderResult['subtitles'] = decrypted.subtitles
            .filter((s) => !!s?.url)
            .map((s) => ({
                url: this.createProxyUrl(s.url, {}),
                label: s.lang ?? s.language ?? 'Unknown',
                format: 'vtt' as const
            }));

        return { sources, subtitles, diagnostics: [] };
    }

    private buildParams(
        server: VideasyServer,
        media: ProviderMediaObject
    ): Record<string, string> {
        const base: Record<string, string> = {
            title: media.title ?? '',
            mediaType: media.type === 'movie' ? 'movie' : 'tv',
            tmdbId: String(media.tmdbId),
            imdbId: media.imdbId ?? '',
            episodeId: String(media.type === 'tv' ? (media.e ?? 1) : 1),
            seasonId: String(media.type === 'tv' ? (media.s ?? 1) : 1)
        };

        if (media.type === 'movie') {
            base.year = String(media.releaseYear ?? '');
        }

        if (server.language) {
            base.language = server.language;
        }

        return base;
    }

    private detectType(url: string, hint?: string): 'hls' | 'mp4' {
        const lower = (hint ?? '').toLowerCase();
        if (
            lower.includes('hls') ||
            lower.includes('m3u8') ||
            url.toLowerCase().includes('.m3u8')
        ) {
            return 'hls';
        }
        return 'mp4';
    }

    private normalizeQuality(raw?: string): string {
        if (!raw) return 'unknown';
        return /^\d{3,4}p$|^4K$|^8K$|^HD$|^SD$/i.test(raw.trim())
            ? raw.trim()
            : 'unknown';
    }

    private resolveLanguage(server: VideasyServer): string {
        if (!server.language) return 'en';
        const map: Record<string, string> = {
            german: 'de',
            italian: 'it',
            french: 'fr'
        };
        return map[server.language] ?? 'en';
    }

    private resolveLanguageLabel(server: VideasyServer): string {
        if (!server.language) return 'English';
        const map: Record<string, string> = {
            german: 'German',
            italian: 'Italian',
            french: 'French'
        };
        return map[server.language] ?? 'English';
    }

    private emptyResult(
        message: string,
        _media: ProviderMediaObject
    ): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}`,
                    field: '',
                    severity: 'error'
                }
            ]
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            const res = await fetch(this.BASE_URL, {
                method: 'HEAD',
                headers: this.HEADERS
            });
            return res.status < 500;
        } catch {
            return false;
        }
    }
}
