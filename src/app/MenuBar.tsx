import { useEffect, useRef, useState } from 'react';

type MenuItem =
  | { label: string; href: string; shortcut?: string }
  | {
      label: string;
      action: 'help' | 'notices' | 'undo' | 'redo';
      shortcut?: string;
    }
  | { label: string; view: 'score' | 'daw' }
  | { label: string; pending: true }
  | { separator: true };

// 항목은 이미 있는 화면으로 이동만 합니다. 아직 없는 기능은 "준비 중"으로 비활성화합니다(design/DESIGN-BRIEF.md §1-8).
const menus: { label: string; items: MenuItem[] }[] = [
  {
    label: '파일',
    items: [
      { label: '새 프로젝트 · 프로젝트 열기', href: '#/library' },
      { label: '악보 · 음원 불러오기', href: '#/copy' },
      { separator: true },
      { label: '녹음 내보내기', href: '#/recordings' },
      { label: '백업 · 복원', href: '#/settings' },
      { label: '휴지통', href: '#/library' },
    ],
  },
  {
    label: '편집',
    items: [
      { label: '음표 편집(카피)', href: '#/copy' },
      { label: '실행 취소', action: 'undo', shortcut: 'Ctrl+Z' },
      { label: '다시 실행', action: 'redo', shortcut: 'Ctrl+Y' },
    ],
  },
  {
    label: '보기',
    items: [
      { label: '악보 / 편집', view: 'score' },
      { label: 'DAW / 편곡', view: 'daw' },
    ],
  },
  {
    label: '트랙',
    items: [
      { label: '사용자 기타 파일 · 믹스', href: '#/performance' },
      { label: '트랙 추가 · 삭제(카피)', href: '#/copy' },
    ],
  },
  {
    label: '마디',
    items: [
      { label: '마디 반복 구간', href: '#/practice' },
      { label: '마디 추가 · 삭제(카피)', href: '#/copy' },
    ],
  },
  {
    label: '음표',
    items: [
      { label: '줄 · 프렛 변경(카피)', href: '#/copy' },
      { label: '주법 추가 · 변경(카피)', href: '#/copy' },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'AI 카피 · 전체 기타 분리', href: '#/copy' },
      { label: 'AI 모델 다운로드 · 설치', href: '#/settings' },
    ],
  },
  {
    label: '오디오',
    items: [
      { label: '입력 장치 · 지연 보정 · 모니터', href: '#/settings' },
      { label: '인서트 효과', pending: true },
    ],
  },
  {
    label: '도구',
    items: [{ label: '반주 찾기', href: '#/backing' }],
  },
  {
    label: '도움말',
    items: [
      { label: '단축키 안내', action: 'help', shortcut: '?' },
      { label: '라이선스 · 고지', action: 'notices' },
    ],
  },
];

export function MenuBar({
  onHelp,
  onNotices,
  onView,
  edit = {},
}: {
  onHelp?: () => void;
  onNotices?: () => void;
  /** docs/12 "메뉴의 준비 중 중 이미 있는 기능": 지금 할 수 없으면 해당 함수를 비웁니다. */
  edit?: { undo?: () => void; redo?: () => void };
  /** 없으면 보기 항목을 비활성으로 둡니다(작업 공간 밖·녹음 잠금). */
  onView?: (view: 'score' | 'daw') => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open === null) return;
    // 캡처 단계로 받아야 하위 요소가 전파를 막아도, 포커스가 메뉴 밖에 있어도 닫힙니다(실제 앱에서 버블 단계는 닫히지 않음).
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(null);
    };
    // 바탕화면·다른 앱을 누르면 창 안 클릭이 없으므로 창이 포커스를 잃을 때도 닫습니다.
    const blur = () => setOpen(null);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
    };
  }, [open]);
  return (
    <nav ref={root} className="menu-bar-menus" aria-label="앱 메뉴">
      {menus.map((menu, index) => (
        <div className="menu" key={menu.label}>
          <button
            className="menu-trigger"
            aria-haspopup="true"
            aria-expanded={open === index}
            onClick={() => setOpen(open === index ? null : index)}
            onPointerEnter={() => {
              if (open !== null && open !== index) setOpen(index);
            }}
          >
            {menu.label}
          </button>
          {open === index && (
            <ul className="menu-list" aria-label={`${menu.label} 메뉴`}>
              {menu.items.map((item, itemIndex) =>
                'separator' in item ? (
                  <li key={itemIndex} className="menu-separator" aria-hidden />
                ) : 'view' in item ? (
                  <li key={item.label}>
                    {onView ? (
                      <button
                        className="menu-item"
                        onClick={() => {
                          setOpen(null);
                          onView(item.view);
                        }}
                      >
                        {item.label}
                      </button>
                    ) : (
                      <span className="menu-item" aria-disabled="true">
                        {item.label}
                      </span>
                    )}
                  </li>
                ) : 'pending' in item ? (
                  <li key={item.label}>
                    <span className="menu-item" aria-disabled="true">
                      {item.label}{' '}
                      <span className="pending-badge">준비 중</span>
                    </span>
                  </li>
                ) : 'href' in item ? (
                  <li key={item.label}>
                    <a
                      className="menu-item"
                      href={item.href}
                      onClick={() => setOpen(null)}
                    >
                      {item.label}
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </a>
                  </li>
                ) : (
                  <li key={item.label}>
                    {(item.action === 'undo' || item.action === 'redo') &&
                    !edit[item.action] ? (
                      <span className="menu-item" aria-disabled="true">
                        {item.label}
                        {item.shortcut && <kbd>{item.shortcut}</kbd>}
                      </span>
                    ) : (
                      <button
                        className="menu-item"
                        onClick={() => {
                          setOpen(null);
                          if (item.action === 'help') onHelp?.();
                          else if (item.action === 'notices') onNotices?.();
                          else edit[item.action]?.();
                        }}
                      >
                        {item.label}
                        {item.shortcut && <kbd>{item.shortcut}</kbd>}
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
