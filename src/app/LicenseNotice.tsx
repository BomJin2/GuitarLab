import appLicense from '../../LICENSE?raw';
import basicPitch from '../../ai/models/basic-pitch-0.4.0-onnx1-windows-cp312.json';
import demucs from '../../ai/models/demucs-4.1.0-htdemucs-6s-windows-cp312.json';
import dependencies from './thirdPartyLicenses.json';

type Package = { name: string; version: string; license: string };
type Plan = {
  modelId: string;
  modelVersion: string;
  researchOnly?: boolean;
  artifacts: Package[];
};

/** MPL 이름이 짧은 라이선스 이름으로 들어 있을 때만(원문 전체가 든 값 제외) 고지를 붙입니다. */
const isMpl = (license: string) =>
  license.length < 80 && /MPL|Mozilla Public License/.test(license);

function PackageTable({
  items,
  source,
}: {
  items: Package[];
  /** MPL 소스 위치 안내에 쓰는 저장소 이름 */
  source: string;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>패키지</th>
          <th>버전</th>
          <th>라이선스</th>
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <tr key={`${a.name}@${a.version}`}>
            <td>{a.name}</td>
            <td>{a.version}</td>
            <td className="license-cell" title={a.license}>
              {a.license}
              {/* MPL은 수정 여부와 소스 위치를 알려야 합니다(docs/12 v2). */}
              {isMpl(a.license) &&
                ` · 수정하지 않은 원본 · 소스는 ${source}의 같은 버전`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const plans: { title: string; plan: Plan }[] = [
  { title: 'Basic Pitch(AI 카피)', plan: basicPitch },
  { title: 'Demucs 전체 기타(분리)', plan: demucs },
];

// docs/12 "라이선스·고지 화면 v1": 빌드에 들어간 고정 자료만 보여 줍니다.
export function LicenseNotice({ onClose }: { onClose: () => void }) {
  return (
    <section className="panel license-notice" aria-label="라이선스 · 고지">
      <h2>라이선스 · 고지</h2>
      <h3>GuitarLab</h3>
      <details>
        <summary>MIT License 원문</summary>
        <pre>{appLicense}</pre>
      </details>
      <h3>앱에 함께 들어 있는 것</h3>
      <ul>
        <li>
          Bravura 악보 글꼴 · SIL Open Font License 1.1 · © Steinberg Media
          Technologies GmbH · 원문: 앱의 font/Bravura-OFL.txt
        </li>
        <li>
          SONiVOX 사운드폰트 · Apache License 2.0 · © Sonic Network Inc. ·
          원문: 앱의 soundfont/LICENSE
        </li>
        <li>
          Python 3.12.15 런타임(설치본) · PSF-2.0과 동봉 라이브러리 고지 · 원문:
          설치 폴더의 ai-runtime/notices
        </li>
        <li>
          Microsoft Visual C++ 런타임 14.51(설치본) · Microsoft 재배포 가능 코드
          · 재배포 법무 검토가 끝나지 않았습니다.
        </li>
      </ul>
      <h3>설치 때 내려받는 AI 모델(앱 배포물에 포함하지 않음)</h3>
      {plans.map(({ title, plan }) => (
        <details key={plan.modelId}>
          <summary>
            {title} {plan.modelVersion} · Python 패키지 {plan.artifacts.length}
            개
          </summary>
          {plan.researchOnly && (
            <p>
              모델 가중치는 연구용으로 제공된 것입니다 · 상용 사용·재배포 허가를
              확인하지 못했습니다.
            </p>
          )}
          <PackageTable items={plan.artifacts} source="PyPI" />
        </details>
      ))}
      <h3>앱에 들어간 화면·Rust 라이브러리</h3>
      <details>
        <summary>화면(npm) 의존성 {dependencies.npm.length}개</summary>
        <PackageTable items={dependencies.npm} source="npm" />
      </details>
      <details>
        <summary>Rust 의존성 {dependencies.cargo.length}개</summary>
        <PackageTable items={dependencies.cargo} source="crates.io" />
      </details>
      <p>라이선스 원문 동봉 여부 등 배포 전 법무 검토가 남아 있습니다.</p>
      <button onClick={onClose}>고지 닫기</button>
    </section>
  );
}
