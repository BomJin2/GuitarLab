//! docs/12 "숨은 이벤트 창 닫기 차단": tao의 숨은 메시지 창이 `WM_CLOSE`로 파괴되면
//! 다른 스레드 → 메인 스레드 메시지(화면 알림·확인 창·창 닫기)가 모두 끊깁니다.
//! 이 창은 tao가 일부러 보이는(WS_VISIBLE·주인 없는) 최상위 창으로 만들어, "주 창"을 찾는 도구가 고를 수 있습니다.

/// 현재 스레드의 `Tao Thread Event Target` 창이 `WM_CLOSE`로 파괴되지 않게 하고,
/// 그 닫기 요청을 `main` 창으로 넘깁니다. 찾으면 true.
#[cfg(windows)]
pub fn guard_current_thread(main: Option<isize>) -> bool {
    imp::guard(imp::CLASS, main.unwrap_or(0))
}

#[cfg(not(windows))]
pub fn guard_current_thread(_main: Option<isize>) -> bool {
    false
}

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicIsize, Ordering};

    pub const CLASS: &str = "Tao Thread Event Target";
    const WM_CLOSE: u32 = 0x0010;
    const GWLP_WNDPROC: i32 = -4;
    type WndProc = unsafe extern "system" fn(isize, u32, usize, isize) -> isize;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentThreadId() -> u32;
    }
    #[link(name = "user32")]
    unsafe extern "system" {
        fn EnumThreadWindows(
            thread: u32,
            callback: unsafe extern "system" fn(isize, isize) -> i32,
            param: isize,
        ) -> i32;
        fn GetClassNameW(window: isize, name: *mut u16, length: i32) -> i32;
        fn SetWindowLongPtrW(window: isize, index: i32, value: isize) -> isize;
        fn PostMessageW(window: isize, message: u32, wparam: usize, lparam: isize) -> i32;
        fn CallWindowProcW(
            previous: isize,
            window: isize,
            message: u32,
            wparam: usize,
            lparam: isize,
        ) -> isize;
    }

    /// 원래 창 프로시저. 앱에는 이 창이 하나뿐이라 전역 하나로 충분합니다.
    static ORIGINAL: AtomicIsize = AtomicIsize::new(0);
    /// 잘못 들어온 닫기 요청을 넘길 실제 앱 창(0이면 버림)
    static FORWARD: AtomicIsize = AtomicIsize::new(0);

    unsafe extern "system" fn guarded(
        window: isize,
        message: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize {
        if message == WM_CLOSE {
            // "주 창 닫기"가 이 창을 고른 경우에도 앱의 정상 종료 확인 흐름을 타게 합니다.
            let main = FORWARD.load(Ordering::Acquire);
            if main != 0 && main != window {
                unsafe { PostMessageW(main, WM_CLOSE, 0, 0) };
            }
            return 0;
        }
        // 원래 프로시저 주소는 교체 전에 저장했으므로 항상 유효합니다.
        unsafe {
            CallWindowProcW(
                ORIGINAL.load(Ordering::Acquire),
                window,
                message,
                wparam,
                lparam,
            )
        }
    }

    struct Search {
        class: Vec<u16>,
        found: isize,
    }

    unsafe extern "system" fn visit(window: isize, param: isize) -> i32 {
        // param은 guard가 넘긴 살아 있는 Search입니다.
        let search = unsafe { &mut *(param as *mut Search) };
        let mut name = [0u16; 64];
        let length = unsafe { GetClassNameW(window, name.as_mut_ptr(), name.len() as i32) };
        if length > 0 && name[..length as usize] == search.class[..] {
            search.found = window;
            return 0;
        }
        1
    }

    pub fn guard(class: &str, forward: isize) -> bool {
        FORWARD.store(forward, Ordering::Release);
        if ORIGINAL.load(Ordering::Acquire) != 0 {
            return true;
        }
        let mut search = Search {
            class: class.encode_utf16().collect(),
            found: 0,
        };
        unsafe {
            EnumThreadWindows(
                GetCurrentThreadId(),
                visit,
                &mut search as *mut Search as isize,
            );
        }
        if search.found == 0 {
            return false;
        }
        let replacement: WndProc = guarded;
        // 같은 스레드에서 교체하므로 교체 도중 이 창의 메시지가 처리되지 않습니다.
        let previous =
            unsafe { SetWindowLongPtrW(search.found, GWLP_WNDPROC, replacement as usize as isize) };
        if previous == 0 {
            return false;
        }
        ORIGINAL.store(previous, Ordering::Release);
        true
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[link(name = "user32")]
        unsafe extern "system" {
            fn RegisterClassW(class: *const WndClass) -> u16;
            fn CreateWindowExW(
                ex_style: u32,
                class: *const u16,
                title: *const u16,
                style: u32,
                x: i32,
                y: i32,
                width: i32,
                height: i32,
                parent: isize,
                menu: isize,
                instance: isize,
                param: isize,
            ) -> isize;
            fn SendMessageW(window: isize, message: u32, wparam: usize, lparam: isize) -> isize;
            fn IsWindow(window: isize) -> i32;
            fn DestroyWindow(window: isize) -> i32;
            fn DefWindowProcW(window: isize, message: u32, wparam: usize, lparam: isize) -> isize;
            fn PeekMessageW(
                message: *mut u8,
                window: isize,
                first: u32,
                last: u32,
                remove: u32,
            ) -> i32;
        }
        #[repr(C)]
        struct WndClass {
            style: u32,
            proc: WndProc,
            class_extra: i32,
            window_extra: i32,
            instance: isize,
            icon: isize,
            cursor: isize,
            background: isize,
            menu: *const u16,
            name: *const u16,
        }
        static SEEN: AtomicIsize = AtomicIsize::new(0);
        unsafe extern "system" fn original(
            window: isize,
            message: u32,
            wparam: usize,
            lparam: isize,
        ) -> isize {
            if message == 0x0400 {
                SEEN.fetch_add(1, Ordering::Relaxed);
                return 7;
            }
            unsafe { DefWindowProcW(window, message, wparam, lparam) }
        }

        #[test]
        fn close_message_goes_to_app_window_and_other_messages_reach_original_procedure() {
            // 실제 tao 창 대신 같은 방식(기본 처리로 WM_CLOSE 시 파괴)의 숨은 창을 이 스레드에 만듭니다.
            let name: Vec<u16> = "GuitarLab Test Event Target\0".encode_utf16().collect();
            let class = WndClass {
                style: 0,
                proc: original,
                class_extra: 0,
                window_extra: 0,
                instance: 0,
                icon: 0,
                cursor: 0,
                background: 0,
                menu: std::ptr::null(),
                name: name.as_ptr(),
            };
            let main_name: Vec<u16> = "GuitarLab Test Main\0".encode_utf16().collect();
            let main_class = WndClass {
                name: main_name.as_ptr(),
                ..class
            };
            let create = |name: &[u16]| unsafe {
                CreateWindowExW(
                    0,
                    name.as_ptr(),
                    std::ptr::null(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                )
            };
            unsafe {
                assert_ne!(RegisterClassW(&class), 0, "창 클래스");
                assert_ne!(RegisterClassW(&main_class), 0, "앱 창 대역 클래스");
            }
            let window = create(&name);
            let main = create(&main_name);
            assert!(window != 0 && main != 0, "테스트 창");
            assert!(!guard("다른 클래스", main), "이름이 다르면 바꾸지 않음");
            assert!(guard("GuitarLab Test Event Target", main));
            let mut message = [0u8; 64];
            unsafe {
                assert_eq!(SendMessageW(window, WM_CLOSE, 0, 0), 0);
                assert_ne!(IsWindow(window), 0, "WM_CLOSE로 파괴되지 않음");
                assert_ne!(
                    PeekMessageW(message.as_mut_ptr(), main, WM_CLOSE, WM_CLOSE, 1),
                    0,
                    "닫기 요청은 실제 앱 창으로 넘어감"
                );
                assert_eq!(
                    SendMessageW(window, 0x0400, 0, 0),
                    7,
                    "다른 메시지는 원래대로"
                );
                assert_eq!(SEEN.load(Ordering::Relaxed), 1);
                assert_ne!(DestroyWindow(window), 0, "직접 파괴는 그대로 가능");
                DestroyWindow(main);
            }
        }
    }
}
