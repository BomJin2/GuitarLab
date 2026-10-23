import { useRef, useState, type ReactNode } from 'react';
export function ResizablePanel({
  children,
  side,
  label,
}: {
  children: ReactNode;
  side: ReactNode;
  label: string;
}) {
  const [width, setWidth] = useState(260);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const resize = (value: number) =>
    setWidth(Math.min(320, Math.max(196, value)));
  return (
    <div className="split-layout">
      <div className="split-main">{children}</div>
      <div className="side-controls">
        <button
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '패널 펼치기' : '패널 접기'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div
            className="splitter"
            role="separator"
            aria-label={label}
            aria-orientation="vertical"
            aria-valuemin={196}
            aria-valuemax={320}
            aria-valuenow={width}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                resize(width + (event.key === 'ArrowLeft' ? 16 : -16));
              }
            }}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragging.current) resize(width - event.movementX);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          />
          <aside className="split-side" style={{ width }}>
            {side}
          </aside>
        </>
      )}
    </div>
  );
}
