use super::*;
use serde_json::json;

#[test]
fn strict_requests_and_routes_never_map_user_paths() {
    assert!(serde_json::from_value::<CloseRequest>(
        json!({"schemaVersion":1,"sessionId":"../escape"})
    )
    .expect("종료 형식")
    .validate()
    .is_err());
    assert!(serde_json::from_value::<CloseRequest>(
        json!({"schemaVersion":1,"sessionId":uuid::Uuid::new_v4().to_string(),"all":true})
    )
    .is_err());
    for value in [
        json!({"schemaVersion":2,"videoId":"Ab_cD-12345"}),
        json!({"schemaVersion":1,"videoId":"../../../../"}),
        json!({"schemaVersion":1,"videoId":"가나다라마바사아자차카"}),
    ] {
        assert!(serde_json::from_value::<OpenRequest>(value)
            .expect("요청 모양")
            .validate()
            .is_err());
    }
    assert!(serde_json::from_value::<OpenRequest>(
        json!({"schemaVersion":1,"videoId":"Ab_cD-12345","path":"C:/secret"})
    )
    .is_err());
    let host = "127.0.0.1:1234";
    let base = "/session/";
    assert_eq!(
        route(
            "GET /session/player.js HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n",
            host,
            base
        ),
        Some("js")
    );
    for request in [
        "POST /session/player.js HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n",
        "GET /session/player.js HTTP/1.1\r\nHost: evil.invalid\r\n\r\n",
        "GET /session/player.js HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nHost: 127.0.0.1:1234\r\n\r\n",
        "GET /session/../player.js HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n",
        "GET /session/player.js?url=https://evil.invalid HTTP/1.1\r\nHost: 127.0.0.1:1234\r\n\r\n",
        "GET /session/player.js HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nContent-Length: 0\r\n\r\n",
        "GET /session/player.js HTTP/1.1\r\n\r\n",
    ] {
        assert_eq!(route(request, host, base), None);
    }
    assert!(!CSP.contains("ipc"));
    assert!(CSP.contains("connect-src 'none'"));
    assert!(!HTML.contains("https://"));
    assert!(!SCRIPT.contains("__TAURI"));
}

#[test]
fn stalled_request_cannot_prevent_session_shutdown() {
    let service = PlayerService::default();
    let session = service
        .open(OpenRequest {
            schema_version: 1,
            video_id: "Ab_cD-12345".into(),
        })
        .expect("세션");
    let url: tauri::Url = session.frame_url.parse().expect("주소");
    let mut stream = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, url.port().expect("포트")))
        .expect("클라이언트");
    stream.write_all(b"GET /unfinished").expect("일부 요청");
    let started = std::time::Instant::now();
    service
        .close(&CloseRequest {
            schema_version: 1,
            session_id: session.session_id,
        })
        .expect("제한 시간 내 종료");
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn idle_browser_preconnect_does_not_delay_player_resources() {
    let service = PlayerService::default();
    let session = service
        .open(OpenRequest {
            schema_version: 1,
            video_id: "Ab_cD-12345".into(),
        })
        .expect("세션");
    let url: tauri::Url = session.frame_url.parse().expect("주소");
    let idle = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, url.port().expect("포트")))
        .expect("브라우저 사전 연결");
    thread::sleep(Duration::from_millis(50));
    let started = std::time::Instant::now();
    assert!(request(&session, "player.html").starts_with("HTTP/1.1 200"));
    let elapsed = started.elapsed();
    eprintln!("자체 HTML 응답: {}ms", elapsed.as_millis());
    drop(idle);
    assert!(
        elapsed < Duration::from_millis(500),
        "비어 있는 사전 연결이 정적 응답을 막습니다"
    );
}

#[test]
fn fragmented_browser_headers_are_assembled_within_the_request_deadline() {
    let service = PlayerService::default();
    let session = service
        .open(OpenRequest {
            schema_version: 1,
            video_id: "Ab_cD-12345".into(),
        })
        .expect("세션");
    let url: tauri::Url = session.frame_url.parse().expect("주소");
    let address = format!("127.0.0.1:{}", url.port().expect("포트"));
    let mut stream = TcpStream::connect(&address).expect("요청 연결");
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("제한");
    stream
        .write_all(format!("GET /{}/player.js HTTP/1.1\r\n", session.session_id).as_bytes())
        .expect("첫 조각");
    thread::sleep(Duration::from_millis(60));
    stream
        .write_all(format!("Host: {address}\r\n\r\n").as_bytes())
        .expect("두 번째 조각");
    let mut response = String::new();
    stream.read_to_string(&mut response).expect("분할 응답");
    assert!(
        response.starts_with("HTTP/1.1 200 OK"),
        "정상적인 분할 요청이 거부되었습니다"
    );
}

fn request(session: &Session, suffix: &str) -> String {
    let url: tauri::Url = session.frame_url.parse().expect("URL");
    let address = format!("127.0.0.1:{}", url.port().expect("포트"));
    let mut stream = TcpStream::connect(&address).expect("loopback 연결");
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("제한");
    stream
        .write_all(
            format!(
                "GET /{}/{suffix} HTTP/1.1\r\nHost: {address}\r\n\r\n",
                session.session_id
            )
            .as_bytes(),
        )
        .expect("요청");
    let mut output = String::new();
    stream.read_to_string(&mut output).expect("응답");
    output
}

#[test]
fn bounded_loopback_session_serves_only_own_two_files_and_closes() {
    let service = PlayerService::default();
    let open = || OpenRequest {
        schema_version: 1,
        video_id: "Ab_cD-12345".into(),
    };
    let session = service.open(open()).expect("세션 시작");
    assert_eq!(
        service.open(open()).err().expect("중복 거부").code,
        "YOUTUBE_SESSION_BUSY"
    );
    let html = request(&session, "player.html");
    assert!(html.starts_with("HTTP/1.1 200 OK"));
    assert!(html.contains(&session.session_id));
    assert!(html.contains("Ab_cD-12345"));
    assert!(!html.contains("__VIDEO_ID__"));
    assert!(html.contains("Cache-Control: no-store"));
    assert!(!html.contains("Access-Control-Allow-Origin"));
    let js = request(&session, "player.js");
    assert!(js.contains("https://www.youtube.com/iframe_api"));
    assert!(request(&session, "../secret").starts_with("HTTP/1.1 404"));
    service
        .close(&CloseRequest {
            schema_version: 1,
            session_id: uuid::Uuid::new_v4().to_string(),
        })
        .expect("오래된 종료 무시");
    assert!(request(&session, "player.js").starts_with("HTTP/1.1 200"));
    service
        .close(&CloseRequest {
            schema_version: 1,
            session_id: session.session_id.clone(),
        })
        .expect("종료");
    let url: tauri::Url = session.frame_url.parse().expect("URL");
    assert!(
        TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, url.port().expect("포트"))).is_err()
    );
    let next = service.open(open()).expect("재시작");
    assert_ne!(next.session_id, session.session_id);
    drop(service);
    let url: tauri::Url = next.frame_url.parse().expect("URL");
    assert!(
        TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, url.port().expect("포트"))).is_err()
    );
}
