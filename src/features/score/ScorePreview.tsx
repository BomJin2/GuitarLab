const strings = ['e', 'B', 'G', 'D', 'A', 'E'];
export function ScorePreview() {
  return (
    <section className="score-preview" aria-label="DEMO TAB 악보">
      <div className="score-heading">
        <strong>DEMO · 자체 제작 단음 프리뷰</strong>
        <span>4/4 · ♩ = 120</span>
      </div>
      <div className="tab-lines">
        {strings.map((string, index) => (
          <div key={string} className="tab-line">
            <span>{string}</span>
            {[0, 1, 2, 3].map((beat) => (
              <span className="tab-beat" key={beat}>
                {index === 0 ? [0, 3, 5, 7][beat] : '—'}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p>정적 화면 예시입니다. 재생·악보 import는 아직 연결되지 않았습니다.</p>
    </section>
  );
}
