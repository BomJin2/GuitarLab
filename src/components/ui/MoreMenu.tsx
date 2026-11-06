import { useEffect, useRef, type ReactNode } from 'react';

// docs/12 도구 줄 "더보기": 자주 쓰지 않는 버튼을 줄 아래 뜨는 목록으로 묶습니다.
export function MoreMenu({
  label = '더보기',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !el.contains(event.target as Node)
      )
        el.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  return (
    <details className="more-menu" ref={ref}>
      <summary>{label} …</summary>
      <div className="more-menu-body">{children}</div>
    </details>
  );
}
