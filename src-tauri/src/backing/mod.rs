use crate::ipc::AppError;
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

const HTML: &str = include_str!("player.html");
const SCRIPT: &str = include_str!("player.js");
const CSP: &str = "default-src 'none'; script-src 'self' https://www.youtube.com; style-src 'unsafe-inline'; frame-src https://www.youtube.com; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors http://tauri.localhost https://tauri.localhost http://127.0.0.1:1420";

fn failed() -> AppError {
    AppError::new(
        "YOUTUBE_SESSION_FAILED",
        "온라인 상태 확인 연결을 준비하지 못했습니다. 닫고 다시 열거나 수동 플레이어를 사용하세요.",
        true,
    )
}
fn valid_video(id: &str) -> bool {
    id.len() == 11
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenRequest {
    schema_version: u8,
    video_id: String,
}
impl OpenRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 || !valid_video(&self.video_id) {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloseRequest {
    pub schema_version: u8,
    pub session_id: String,
}
impl CloseRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        crate::storage::project_model::validate_uuid(&self.session_id)
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    schema_version: u8,
    session_id: String,
    video_id: String,
    frame_url: String,
}
struct Server {
    session: Session,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            if worker.join().is_err() {
                eprintln!("GuitarLab 온라인 연결 종료 실패: YOUTUBE_SESSION_JOIN_FAILED");
            }
        }
    }
}
#[derive(Default)]
pub struct PlayerService(Mutex<Option<Server>>);
impl PlayerService {
    pub fn open(&self, request: OpenRequest) -> Result<Session, AppError> {
        request.validate()?;
        let mut current = self.0.lock().map_err(|_| failed())?;
        if current.is_some() {
            return Err(AppError::new(
                "YOUTUBE_SESSION_BUSY",
                "이전 온라인 플레이어를 닫은 뒤 다시 열어주세요.",
                true,
            ));
        }
        let listener =
            TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).map_err(|_| failed())?;
        listener.set_nonblocking(true).map_err(|_| failed())?;
        let host = listener.local_addr().map_err(|_| failed())?.to_string();
        let session_id = uuid::Uuid::new_v4().to_string();
        let base = format!("/{session_id}/");
        let session = Session {
            schema_version: 1,
            session_id: session_id.clone(),
            video_id: request.video_id.clone(),
            frame_url: format!("http://{host}{base}player.html"),
        };
        let html = HTML
            .replace("__SESSION_ID__", &session_id)
            .replace("__VIDEO_ID__", &request.video_id);
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = stop.clone();
        let page = Arc::new((host, base, html));
        let worker = thread::Builder::new()
            .name("youtube-player".into())
            .spawn(move || {
                let mut clients: Vec<JoinHandle<()>> = Vec::new();
                while !worker_stop.load(Ordering::Acquire) {
                    for index in (0..clients.len()).rev() {
                        if clients[index].is_finished() && clients.swap_remove(index).join().is_err() {
                            eprintln!("GuitarLab 온라인 요청 실패: YOUTUBE_REQUEST_JOIN_FAILED");
                        }
                    }
                    if clients.len() >= 8 {
                        thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    match listener.accept() {
                        Ok((stream, address)) if address.ip().is_loopback() => {
                            let page = page.clone();
                            match thread::Builder::new().name("youtube-request".into()).spawn(move || serve(stream, &page.0, &page.1, &page.2)) {
                                Ok(client) => clients.push(client),
                                Err(_) => {
                                    eprintln!("GuitarLab 온라인 요청 시작 실패: YOUTUBE_REQUEST_SPAWN_FAILED");
                                    break;
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(20))
                        }
                        Err(_) => break,
                    }
                }
                for client in clients {
                    if client.join().is_err() {eprintln!("GuitarLab 온라인 요청 종료 실패: YOUTUBE_REQUEST_JOIN_FAILED");}
                }
            })
            .map_err(|_| failed())?;
        *current = Some(Server {
            session: session.clone(),
            stop,
            worker: Some(worker),
        });
        Ok(session)
    }
    pub fn close(&self, request: &CloseRequest) -> Result<(), AppError> {
        request.validate()?;
        let mut current = self.0.lock().map_err(|_| failed())?;
        if current
            .as_ref()
            .is_some_and(|server| server.session.session_id == request.session_id)
        {
            current.take();
        }
        Ok(())
    }
}

fn serve(mut stream: TcpStream, host: &str, base: &str, html: &str) {
    // Windows의 listener nonblocking 상속 때문에 분할 헤더를 조기 거부하지 않도록 합니다.
    if stream.set_nonblocking(false).is_err()
        || stream
            .set_read_timeout(Some(Duration::from_secs(1)))
            .is_err()
        || stream
            .set_write_timeout(Some(Duration::from_secs(1)))
            .is_err()
    {
        return;
    }
    let mut buffer = [0u8; 8192];
    let mut size = 0;
    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    while size < buffer.len() && std::time::Instant::now() < deadline {
        if stream
            .set_read_timeout(Some(
                deadline
                    .saturating_duration_since(std::time::Instant::now())
                    .max(Duration::from_millis(1)),
            ))
            .is_err()
        {
            return;
        }
        match stream.read(&mut buffer[size..]) {
            Ok(0) | Err(_) => return,
            Ok(count) => {
                size += count;
                if buffer[..size].windows(4).any(|s| s == b"\r\n\r\n") {
                    break;
                }
            }
        }
    }
    let response = std::str::from_utf8(&buffer[..size])
        .ok()
        .and_then(|request| route(request, host, base));
    let (status, mime, body) = match response {
        Some("html") => ("200 OK", "text/html; charset=utf-8", html),
        Some("js") => ("200 OK", "text/javascript; charset=utf-8", SCRIPT),
        _ => (
            "404 Not Found",
            "text/plain; charset=utf-8",
            "사용할 수 없는 요청입니다.",
        ),
    };
    let headers = format!("HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nContent-Security-Policy: {CSP}\r\n\r\n", body.len());
    if stream.write_all(headers.as_bytes()).is_ok() {
        let _ = stream.write_all(body.as_bytes());
    }
}
fn route(request: &str, host: &str, base: &str) -> Option<&'static str> {
    let (headers, body) = request.split_once("\r\n\r\n")?;
    if !body.is_empty() {
        return None;
    }
    let mut lines = headers.split("\r\n");
    let mut line = lines.next()?.split(' ');
    if line.next()? != "GET" {
        return None;
    }
    let path = line.next()?;
    if line.next()? != "HTTP/1.1" || line.next().is_some() {
        return None;
    }
    let mut hosts = 0;
    for line in lines {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("host") {
            hosts += 1;
            if value.trim() != host {
                return None;
            }
        }
        if name.eq_ignore_ascii_case("transfer-encoding")
            || name.eq_ignore_ascii_case("content-length")
        {
            return None;
        }
    }
    if hosts != 1 {
        return None;
    }
    if path == format!("{base}player.html") {
        Some("html")
    } else if path == format!("{base}player.js") {
        Some("js")
    } else {
        None
    }
}

#[cfg(test)]
mod tests;
