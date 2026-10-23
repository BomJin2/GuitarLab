pub const PROTOCOL_VERSION: u8 = 1;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: &'static str,
    pub message: &'static str,
    pub retryable: bool,
}
impl AppError {
    pub fn new(code: &'static str, message: &'static str, retryable: bool) -> Self {
        Self {
            code,
            message,
            retryable,
        }
    }
    pub fn invalid() -> Self {
        Self::new(
            "INVALID_INPUT",
            "입력 값 또는 계약 버전을 확인하세요.",
            false,
        )
    }
    pub fn internal() -> Self {
        Self::new(
            "AUDIO_WORKER_FAILED",
            "입력 처리 상태를 복구할 수 없습니다. 앱을 다시 시작하세요.",
            true,
        )
    }
}

#[test]
fn protocol_version_is_one() {
    assert_eq!(PROTOCOL_VERSION, 1);
}
