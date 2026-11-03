"""모델 다운로드용 HTTPS 검증 설정."""
import ssl


def https_context() -> ssl.SSLContext:
    """Windows 시스템 인증서 검증을 사용합니다(깨끗한 PC의 지연 루트 인증서 포함)."""
    try:
        from pip._vendor import truststore  # 배포 런타임 pip가 함께 제공하는 MIT 모듈
    except ImportError:
        # shortcut: 구형 pip 개발 환경은 Python 기본 저장소를 씁니다. 배포 런타임 포함 여부는 test_tls가 고정합니다.
        return ssl.create_default_context()
    return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
