import musicXml from '../../../fixtures/blank.musicxml?raw';

export function blankScoreFile(): File {
  return new File([musicXml], '새 기타 악보.musicxml', {
    type: 'application/vnd.recordare.musicxml+xml',
  });
}
