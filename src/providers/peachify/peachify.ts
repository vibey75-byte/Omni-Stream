import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult
} from '@omss/framework';
import type {
    PeachifyApiResponse,
    PeachifyParsedSource,
    PeachifyParsedSubtitle,
    PeachifyRawSource,
    PeachifyRawSubtitle
} from './peachify.types.js';
import decrypt from './decrypt.js';
import { generateRandomUserAgent } from '../../utils/ua.js';

export class PeachifyProvider extends BaseProvider {
    readonly id = 'Peachify';
    readonly name = 'Peachify';
    readonly enabled = true;
    readonly BASE_URL = 'https://peachify.top';
    readonly MOVIEBOX_URL = 'https://uwu.eat-peach.sbs';
    readonly API_URL = 'https://usa.eat-peach.sbs';
    readonly HEADERS = {
        'User-Agent': '',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${this.BASE_URL}/`,
        Origin: this.BASE_URL
    };

    readonly PEACHIFY_SERVERS = [
        `${this.MOVIEBOX_URL}/moviebox`,
        `${this.API_URL}/holly`,
        `${this.API_URL}/air`,
        `${this.API_URL}/multi`,
        `${this.MOVIEBOX_URL}/net`,
        `${this.MOVIEBOX_URL}/bmb`
    ];

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        this.HEADERS['User-Agent'] = generateRandomUserAgent();

        const results = await Promise.allSettled(
            this.PEACHIFY_SERVERS.map((server) =>
                this.fetchFromServer(server, media)
            )
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
                message: `${failCount} of ${this.PEACHIFY_SERVERS.length} peachify servers failed to respond`,
                field: '',
                severity: 'warning'
            });
        }

        if (sources.length === 0) {
            return this.emptyResult('all peachify servers returned no sources', media);
        }

        return { sources, subtitles, diagnostics };
    }

    private async fetchFromServer(
        serverBase: string,
        media: ProviderMediaObject
    ): Promise<ProviderResult | null> {
        const apiUrl = this.buildApiUrl(serverBase, media);
        const response = await fetch(apiUrl, { headers: this.HEADERS });
        if (!response.ok) return null;

        let body = (await response.json()) as PeachifyApiResponse;

        if (body.isEncrypted && body.data) {
            const decrypted = await decrypt(body.data);
            if (!decrypted) return null;
            body = decrypted;
        }

        const rawSources = Array.isArray(body.sources) ? body.sources : [];
        const rawSubtitles = Array.isArray(body.subtitles) ? body.subtitles : [];

        if (rawSources.length === 0) return null;

        const serverName = new URL(serverBase).hostname;
        const parsed = rawSources
            .map((s) => this.parseSource(s, serverName))
            .filter((s): s is PeachifyParsedSource => s !== null);

        const parsedSubs = rawSubtitles
            .map((s) => this.parseSubtitle(s, serverName))
            .filter((s): s is PeachifyParsedSubtitle => s !== null);

        const sources: ProviderResult['sources'] = parsed.map((s) => ({
            url: this.createProxyUrl(s.url, s.headers ?? this.HEADERS),
            type: s.type,
            quality: s.quality?.toString() ?? 'Auto',
            audioTracks: [
                {
                    label: s.dub,
                    language: s.dub.toLowerCase().substring(0, 2)
                }
            ],
            provider: { id: this.id, name: this.name }
        }));

        const subtitles: ProviderResult['subtitles'] = parsedSubs.map((s) => ({
            url: this.createProxyUrl(s.url, this.HEADERS),
            label: s.label,
            format: 'vtt'
        }));

        return { sources, subtitles, diagnostics: [] };
    }

    private buildApiUrl(serverBase: string, media: ProviderMediaObject): string {
        if (media.type === 'movie') return `${serverBase}/movie/${media.tmdbId}`;
        if (media.type === 'tv') {
            if (!media.s || !media.e) throw new Error('missing season or episode number');
            return `${serverBase}/tv/${media.tmdbId}/${media.s}/${media.e}`;
        }
        throw new Error(`unsupported media type: ${media.type}`);
    }

    private parseSource(
        raw: PeachifyRawSource,
        providerName: string
    ): PeachifyParsedSource | null {
        const url = this.pickString(raw, [
            'url', 'src', 'file', 'stream', 'streamUrl', 'playbackUrl'
        ]);
        if (!url) return null;

        const rawType = this.pickString(raw, ['type', 'format', 'container']).toLowerCase();
        const type: 'hls' | 'mp4' =
            rawType.includes('hls') || rawType.includes('m3u8') ||
            url.toLowerCase().includes('.m3u8')
                ? 'hls'
                : 'mp4';

        const rawDub = this.pickString(raw, [
            'dub', 'audio', 'audioName', 'audioLang', 'language', 'lang', 'label', 'name', 'title'
        ]);
        const dub = this.normalizeDubLabel(rawDub);
        const quality = this.pickNumber(raw, ['quality', 'resolution', 'height', 'res']);
        const sizeBytes = this.pickNumber(raw, ['sizeBytes', 'size', 'bytes']);
        const rawHeaders = raw.headers ?? raw.header ?? raw.requestHeaders ?? raw.httpHeaders;
        const headers = this.normalizeHeaders(rawHeaders);

        return { url, dub, type, quality, sizeBytes, headers, provider: providerName };
    }

    private parseSubtitle(
        raw: PeachifyRawSubtitle,
        providerName: string
    ): PeachifyParsedSubtitle | null {
        const url = raw.url ?? raw.file ?? raw.src;
        if (!url) return null;
        const label = raw.label ?? raw.name ?? raw.language ?? 'Auto';
        const lang = raw.langCode ?? raw.lang ?? raw.language;
        return { url, label, lang, display: label, provider: providerName };
    }

    private pickString(obj: Record<string, unknown>, keys: string[]): string {
        for (const key of keys) {
            const val = obj[key];
            if (typeof val === 'string' && val.trim()) return val.trim();
        }
        return '';
    }

    private pickNumber(
        obj: Record<string, unknown>,
        keys: string[]
    ): number | undefined {
        for (const key of keys) {
            const val = obj[key];
            if (typeof val === 'number' && Number.isFinite(val)) return val;
            if (typeof val === 'string' && val.trim()) {
                const match = val.match(/\d{3,4}/);
                if (match) return Number(match[0]);
                const parsed = Number(val);
                if (Number.isFinite(parsed)) return parsed;
            }
        }
        return undefined;
    }

    private normalizeDubLabel(raw: string): string {
        if (!raw.trim()) return 'Original';
        const lower = raw.trim().toLowerCase();
        if (lower === 'dubbed') return 'Dub';
        if (lower === 'subbed') return 'Sub';
        return raw.trim();
    }

    private normalizeHeaders(
        raw: Record<string, unknown> | undefined
    ): Record<string, string> | undefined {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
        const entries = Object.entries(raw)
            .filter(([k, v]) => k.trim().length > 0 && v != null)
            .map(([k, v]): [string, string] => [k, String(v)]);
        return entries.length ? Object.fromEntries(entries) : undefined;
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
            return res.status === 200;
        } catch {
            return false;
        }
    }
}
