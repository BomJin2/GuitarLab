use crate::ipc::AppError;
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseIntent {
    pub schema_version: u8,
    pub request_id: Uuid,
}
struct Pending {
    id: Uuid,
    since: Instant,
    prompting: bool,
}
#[derive(Default)]
struct State {
    enabled: bool,
    permit: bool,
    pending: Option<Pending>,
}
#[derive(Default)]
pub struct CloseGuard(Mutex<State>);
pub enum Decision {
    Allow,
    Block,
    AskFrontend(CloseIntent),
    AskFallback(CloseIntent),
}
fn unavailable() -> AppError {
    AppError::new(
        "CLOSE_GUARD_UNAVAILABLE",
        "종료 상태를 확인하지 못했습니다. 다시 시도하세요.",
        true,
    )
}
fn stale() -> AppError {
    AppError::new(
        "CLOSE_REQUEST_EXPIRED",
        "이전 종료 요청입니다. 창 닫기를 다시 눌러주세요.",
        true,
    )
}
impl CloseGuard {
    pub fn enable(&self) -> Result<(), AppError> {
        self.0.lock().map_err(|_| unavailable())?.enabled = true;
        Ok(())
    }
    pub fn on_close(&self, blocked: bool, now: Instant) -> Result<Decision, AppError> {
        let mut state = self.0.lock().map_err(|_| unavailable())?;
        let permit = std::mem::take(&mut state.permit);
        if blocked {
            state.pending = None;
            return Ok(Decision::Block);
        }
        if permit || !state.enabled {
            return Ok(Decision::Allow);
        }
        if let Some(pending) = &mut state.pending {
            if !pending.prompting
                && now.saturating_duration_since(pending.since) >= Duration::from_secs(5)
            {
                pending.prompting = true;
                return Ok(Decision::AskFallback(CloseIntent {
                    schema_version: 1,
                    request_id: pending.id,
                }));
            }
            return Ok(Decision::Block);
        }
        let id = Uuid::new_v4();
        state.pending = Some(Pending {
            id,
            since: now,
            prompting: false,
        });
        Ok(Decision::AskFrontend(CloseIntent {
            schema_version: 1,
            request_id: id,
        }))
    }
    pub fn resolve(&self, id: Uuid, dirty: bool) -> Result<bool, AppError> {
        let mut state = self.0.lock().map_err(|_| unavailable())?;
        let pending = state
            .pending
            .as_mut()
            .filter(|p| p.id == id && !p.prompting)
            .ok_or_else(stale)?;
        if dirty {
            pending.prompting = true;
        }
        Ok(dirty)
    }
    pub fn finish(&self, id: Uuid, accepted: bool) -> Result<(), AppError> {
        let mut state = self.0.lock().map_err(|_| unavailable())?;
        if !state.pending.as_ref().is_some_and(|p| p.id == id) {
            return Err(stale());
        }
        state.pending = None;
        state.permit = accepted;
        Ok(())
    }
    pub fn revoke(&self) -> Result<(), AppError> {
        let mut state = self.0.lock().map_err(|_| unavailable())?;
        state.permit = false;
        Ok(())
    }
}

pub fn finish_close(app: &tauri::AppHandle, id: Uuid, accepted: bool) -> Result<(), AppError> {
    let guard = app.state::<CloseGuard>();
    let window = if accepted {
        Some(app.get_webview_window("main").ok_or_else(unavailable)?)
    } else {
        None
    };
    guard.finish(id, accepted)?;
    if let Some(window) = window {
        let result = window.close();
        if result.is_err() {
            guard.revoke()?;
            return Err(unavailable());
        }
    }
    Ok(())
}

pub fn confirm_close(app: &tauri::AppHandle, id: Uuid, fallback: bool) {
    let handle = app.clone();
    let text = if fallback {
        "편집 화면의 응답을 확인하지 못했습니다. 저장하지 않은 악보 변경이 사라질 수 있습니다. 닫으시겠습니까?"
    } else {
        "저장하지 않은 악보 변경이 있습니다. 저장하려면 계속 편집을 선택하고 프로젝트를 저장하세요."
    };
    let mut dialog = app
        .dialog()
        .message(text)
        .title("GuitarLab · 악보 저장 확인")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "저장하지 않고 닫기".into(),
            "계속 편집".into(),
        ));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }
    dialog.show(move |accepted| {
        if finish_close(&handle, id, accepted).is_err() {
            eprintln!("GuitarLab 종료 확인 실패: CLOSE_REQUEST_EXPIRED");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn intent(guard: &CloseGuard, now: Instant) -> Uuid {
        match guard.on_close(false, now).expect("요청") {
            Decision::AskFrontend(event) => event.request_id,
            _ => panic!("화면 확인 요청 필요"),
        }
    }
    #[test]
    fn clean_closes_once_and_busy_still_wins() {
        let guard = CloseGuard::default();
        assert!(matches!(
            guard.on_close(false, Instant::now()).expect("초기"),
            Decision::Allow
        ));
        guard.enable().expect("활성화");
        guard.enable().expect("멱등");
        let now = Instant::now();
        let id = intent(&guard, now);
        assert!(!guard.resolve(id, false).expect("변경 없음"));
        guard.finish(id, true).expect("허가");
        assert!(matches!(
            guard.on_close(false, now).expect("종료"),
            Decision::Allow
        ));
        let next = intent(&guard, now);
        guard.finish(next, true).expect("허가");
        assert!(matches!(
            guard.on_close(true, now).expect("녹음 우선"),
            Decision::Block
        ));
        intent(&guard, now);
    }
    #[test]
    fn dirty_cancel_and_stale_callbacks_never_grant_close() {
        let guard = CloseGuard::default();
        guard.enable().expect("활성화");
        let now = Instant::now();
        let id = intent(&guard, now);
        assert!(guard.resolve(id, true).expect("편집 확인"));
        assert!(guard.resolve(id, false).is_err());
        assert!(matches!(
            guard
                .on_close(false, now + Duration::from_secs(10))
                .expect("확인 중"),
            Decision::Block
        ));
        guard.finish(id, false).expect("계속 편집");
        let next = intent(&guard, now);
        assert_ne!(id, next);
        assert!(guard.finish(id, true).is_err());
        assert!(guard.resolve(Uuid::new_v4(), false).is_err());
        assert!(matches!(
            guard.on_close(true, now).expect("작업 우선"),
            Decision::Block
        ));
        assert!(guard.finish(next, true).is_err());
    }
    #[test]
    fn missing_frontend_requires_explicit_fallback_and_rechecks_work() {
        let guard = CloseGuard::default();
        guard.enable().expect("활성화");
        let now = Instant::now();
        let id = intent(&guard, now);
        assert!(matches!(
            guard
                .on_close(false, now + Duration::from_secs(4))
                .expect("대기"),
            Decision::Block
        ));
        match guard
            .on_close(false, now + Duration::from_secs(5))
            .expect("대체 확인")
        {
            Decision::AskFallback(event) => assert_eq!(event.request_id, id),
            _ => panic!("명시적 확인 필요"),
        }
        assert!(guard.resolve(id, false).is_err());
        guard.finish(id, true).expect("사용자 확인");
        assert!(matches!(
            guard.on_close(true, now).expect("저장 우선"),
            Decision::Block
        ));
        intent(&guard, now);
    }
}
