import { describe, expect, it } from 'vitest';
import { parseYoutubeUrl, youtubeCapability, youtubeEmbedUrl } from './youtube';

describe('YouTube URL 경계', () => {
  it.each([
    'https://www.youtube.com/watch?v=Ab_cD-12345&list=ignored&t=20#start',
    'https://youtube.com/watch?v=Ab_cD-12345',
    'https://m.youtube.com/watch?v=Ab_cD-12345',
    'https://youtu.be/Ab_cD-12345?si=ignored',
    'https://www.youtube.com/shorts/Ab_cD-12345',
    'https://www.youtube.com/embed/Ab_cD-12345',
  ])('지원 URL에서 ID만 사용한다: %s', (url) => {
    const selected = parseYoutubeUrl(url);
    expect(selected).toEqual({
      kind: 'YOUTUBE_EMBED',
      videoId: 'Ab_cD-12345',
      selectedByUser: true,
    });
    expect(youtubeEmbedUrl(selected)).toBe(
      'https://www.youtube.com/embed/Ab_cD-12345?autoplay=0&controls=1&playsinline=1',
    );
  });
  it.each([
    '',
    'Ab_cD-12345',
    'javascript:alert(1)',
    'file:///youtube.com/watch?v=Ab_cD-12345',
    'http://www.youtube.com/watch?v=Ab_cD-12345',
    'https://www.youtube.com.evil.invalid/watch?v=Ab_cD-12345',
    'https://evil.invalid@www.youtube.com/watch?v=Ab_cD-12345',
    'https://www.youtube.com:8443/watch?v=Ab_cD-12345',
    'https://www.youtube.com/watch?v=Ab_cD-12345&v=Ab_cD-12345',
    'https://www.youtube.com/watch?list=playlist',
    'https://youtu.be/Ab_cD-12345/extra',
    'https://www.youtube.com/embed/%41b_cD-12345',
    'https://www.youtube.com/redirect?q=https://example.invalid',
    'https://www.youtube.com/watch?v=short',
    'https://www.you\ntube.com/watch?v=Ab_cD-12345',
    'https://www.youtube.com\\@evil.invalid/watch?v=Ab_cD-12345',
    `https://youtu.be/Ab_cD-12345?${'x'.repeat(2048)}`,
  ])('외부 호스트·모호하거나 위험한 주소는 거부한다: %s', (url) => {
    expect(() => parseYoutubeUrl(url)).toThrow('YT_URL_INVALID');
  });
  it('직접 만든 객체도 임의 URL로 확장하지 않고 로컬 기능을 제공하지 않는다', () => {
    expect(() =>
      youtubeEmbedUrl({
        kind: 'YOUTUBE_EMBED',
        selectedByUser: true,
        videoId: '../x',
      }),
    ).toThrow();
    expect(youtubeCapability).toEqual({
      syncPrecision: 'BEST_EFFORT',
      canPreciseLoop: false,
      canTimeStretch: false,
      canAnalyzeAudio: false,
      canRecordBackingToFile: false,
    });
  });
});
