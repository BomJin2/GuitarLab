//! Phase 0 PoC: 설치된 AmpliTube 5 VST3를 앱 안(in-process)에서 열어 합성 기타 DI를 오프라인 처리합니다.
//! 사용: guitarlab-vst3-amplitube-probe <출력 폴더>
//! 출력 폴더에 dry.wav·wet-*.wav와 report.json을 씁니다. 사용자 데이터·실제 오디오 장치는 쓰지 않습니다.
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use vst3_host::{audio::SpeakerArrangement, AudioBuffers, Vst3Host};

const RATE: f64 = 48_000.0;
const BLOCK: usize = 256;

fn main() {
    let out = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("출력 폴더 인자가 필요합니다"),
    );
    // 기존 폴더(예: 녹음 테이크 폴더)의 파일을 덮어쓰지 않도록 새 폴더만 받습니다.
    if let Some(parent) = out.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).expect("출력 상위 폴더");
    }
    fs::create_dir(&out).expect("출력 폴더는 아직 없는 새 경로여야 합니다(기존 파일 보호)");
    // 인증 창 등으로 멈추면 원인을 남기고 끝냅니다(강제 종료는 이 검사 프로세스만).
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(180));
        eprintln!("TIMEOUT: 180초 안에 끝나지 않음(인증 창·대화상자 대기 가능)");
        std::process::exit(3);
    });
    let mut report = Vec::<String>::new();
    let mut log = |line: String| {
        println!("{line}");
        report.push(line);
    };

    let mut host = Vst3Host::builder()
        .sample_rate(RATE)
        .block_size(BLOCK)
        .scan_default_paths()
        .build()
        .expect("호스트 생성");
    if std::env::args().nth(2).as_deref() == Some("cycles") {
        cycles(&mut host);
        return;
    }
    if std::env::args().nth(2).as_deref() == Some("editor") {
        editor(&mut host);
        return;
    }
    let started = Instant::now();
    let plugins = host.discover_plugins().expect("VST3 검색");
    log(format!(
        "검색 {}개 · {:?}",
        plugins.len(),
        started.elapsed()
    ));
    for p in &plugins {
        log(format!(
            "  {} | {} | {} | {} | uid={} | in={} out={} | gui={} | {}",
            p.name,
            p.vendor,
            p.version,
            p.category,
            p.uid,
            p.audio_inputs,
            p.audio_outputs,
            p.has_gui,
            p.path.display()
        ));
    }
    let Some(info) = plugins
        .iter()
        .find(|p| p.name.contains("AmpliTube 5") && p.category.contains("Fx"))
        .or_else(|| plugins.iter().find(|p| p.name.contains("AmpliTube 5")))
        .cloned()
    else {
        log("BLOCKER: AmpliTube 5 VST3를 찾지 못함".into());
        finish(&out, &report);
        return;
    };

    if std::env::var("PROBE_PRECREATE").as_deref() == Ok("1") {
        // 프로세스의 첫 인스턴스만 다른 소리를 내는지 보려고, 버릴 인스턴스를 먼저 만들었다 지웁니다.
        let warm = host.load_plugin_class(&info.path, &info.uid).map(|_| ());
        log(format!(
            "버릴 인스턴스 먼저 생성 {:?}",
            warm.err().map(|e| e.to_string())
        ));
    }
    let started = Instant::now();
    let mut plugin = match host.load_plugin_class(&info.path, &info.uid) {
        Ok(p) => p,
        Err(e) => {
            log(format!("BLOCKER: 로드 실패: {e}"));
            finish(&out, &report);
            return;
        }
    };
    log(format!("로드 {:?}", started.elapsed()));
    let buses = plugin.bus_arrangements().expect("버스 조회");
    log(format!(
        "기본 버스 in={:?} out={:?}",
        raw(&buses.inputs),
        raw(&buses.outputs)
    ));
    // 기타 DI는 mono, 출력은 stereo를 요청합니다. 플러그인이 거절하면 실제 적용값을 그대로 씁니다.
    let request =
        plugin.set_bus_arrangements(&[SpeakerArrangement::MONO], &[SpeakerArrangement::STEREO]);
    let buses = plugin.bus_arrangements().expect("버스 재조회");
    log(format!(
        "mono→stereo 요청 {:?} · 적용 in={:?} out={:?}",
        request.err().map(|e| e.to_string()),
        raw(&buses.inputs),
        raw(&buses.outputs)
    ));
    let in_ch = buses.inputs.first().map(|a| a.channel_count()).unwrap_or(0);
    let out_ch = buses
        .outputs
        .first()
        .map(|a| a.channel_count())
        .unwrap_or(0);
    log(format!(
        "채널 in={in_ch} out={out_ch} · latency={} · tail={} · editor={}",
        plugin.latency_samples(),
        plugin.tail_samples(),
        plugin.has_editor()
    ));
    let params = plugin.get_parameters().unwrap_or_default();
    log(format!("파라미터 {}개", params.len()));
    let named: Vec<_> = params
        .iter()
        .filter(|p| !p.name.starts_with("Param "))
        .collect();
    log(format!("이름 있는 파라미터 {}개", named.len()));
    for p in named.iter().take(40) {
        log(format!(
            "  #{} {} = {:.3} (기본 {:.3}, step {}, ro={}, bypass={})",
            p.id, p.name, p.value, p.default, p.step_count, p.is_read_only, p.is_bypass
        ));
    }

    let dry = synth_di();
    write_wav(&out.join("dry.wav"), std::slice::from_ref(&dry));
    let dry_hash_before = fnv(&fs::read(out.join("dry.wav")).unwrap());

    plugin.start_processing().expect("처리 시작");
    // 로드 직후 플러그인이 기본 설정을 비동기로 불러오는 동안 오프라인 처리를 시작하면 결과가 다를 수 있어 대기 시간을 바꿔 봅니다.
    let settle: u64 = std::env::var("PROBE_SETTLE_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    std::thread::sleep(Duration::from_millis(settle));
    log(format!("처리 전 대기 {settle}ms"));
    if std::env::var("PROBE_RELOAD_FIRST").as_deref() == Ok("1") {
        // 처음 상태를 그대로 다시 넣어, 플러그인이 보고하는 상태와 실제 처리 상태가 같아지는지 봅니다.
        let own = plugin.save_state().expect("처음 상태 저장");
        let _ = plugin.stop_processing();
        let loaded = plugin.load_state(&own);
        plugin.start_processing().expect("처리 재시작");
        log(format!(
            "처음 상태 다시 넣기 {} 바이트 {:?}",
            own.len(),
            loaded.err().map(|e| e.to_string())
        ));
    }
    let a = render(&mut plugin, &dry, in_ch, out_ch);
    write_wav(&out.join("wet-a.wav"), &a);
    log(format!("A(기본 상태) {}", describe(&dry, &a)));

    let state = plugin.save_state();
    log(format!(
        "상태 저장 {:?}",
        state.as_ref().map(|s| s.len()).map_err(|e| e.to_string())
    ));

    // 이름 없는 자동화 슬롯("Param N")은 기본으로 아무 기능에도 연결돼 있지 않아 톤 변경 검사에 쓰지 않습니다.
    // 대신 bypass 파라미터로 "파라미터가 실제 처리에 반영되는지"만 확인합니다.
    if let Some(p) = params.iter().find(|p| p.is_bypass) {
        let set = plugin.set_parameter(p.id, 1.0);
        let b = render(&mut plugin, &dry, in_ch, out_ch);
        write_wav(&out.join("wet-b-bypass.wav"), &b);
        log(format!(
            "B(bypass {} → 1 {:?}) {}",
            p.name,
            set.err().map(|e| e.to_string()),
            describe(&dry, &b)
        ));
        let _ = plugin.set_parameter(p.id, 0.0);
    } else {
        log("bypass 파라미터 없음".into());
    }

    // 기준: 같은 기본 설정을 새 인스턴스로 다시 렌더링했을 때의 차이(잡음·변조로 샘플이 매번 다를 수 있음).
    match host.load_plugin_class(&info.path, &info.uid) {
        Ok(mut other) => {
            let set = other
                .set_bus_arrangements(&[SpeakerArrangement::MONO], &[SpeakerArrangement::STEREO]);
            log(format!(
                "E 버스 요청 {:?} · 적용 {:?}",
                set.err().map(|e| e.to_string()),
                other
                    .bus_arrangements()
                    .map(|b| (raw(&b.inputs), raw(&b.outputs)))
                    .map_err(|e| e.to_string())
            ));
            if std::env::var("PROBE_EDITOR_E").as_deref() == Ok("1") {
                log(format!(
                    "E latency={} tail={} editor={}",
                    other.latency_samples(),
                    other.tail_samples(),
                    other.has_editor()
                ));
            }
            if std::env::var("PROBE_QUERY_E").as_deref() == Ok("1") {
                log(format!(
                    "E 파라미터 조회 {}개",
                    other.get_parameters().map(|p| p.len()).unwrap_or(0)
                ));
            }
            other.start_processing().expect("기준 인스턴스 처리 시작");
            let e = render(&mut other, &dry, in_ch, out_ch);
            write_wav(&out.join("wet-e-baseline.wav"), &e);
            log(format!(
                "E(새 인스턴스 기본 설정, 기준) A와 비교 {}",
                compare(&a, &e)
            ));
            let _ = other.stop_processing();
        }
        Err(e) => log(format!("E 기준 인스턴스 로드 실패: {e}")),
    }

    if let Ok(blob) = &state {
        let loaded = plugin.load_state(blob);
        let c = render(&mut plugin, &dry, in_ch, out_ch);
        write_wav(&out.join("wet-c.wav"), &c);
        log(format!(
            "C(상태 복원 {:?}) A와 비교 {}",
            loaded.err().map(|e| e.to_string()),
            compare(&a, &c)
        ));

        match host.load_plugin_class(&info.path, &info.uid) {
            Ok(mut fresh) => {
                let set = fresh.set_bus_arrangements(
                    &[SpeakerArrangement::MONO],
                    &[SpeakerArrangement::STEREO],
                );
                log(format!(
                    "D 버스 요청 {:?} · 적용 {:?}",
                    set.err().map(|e| e.to_string()),
                    fresh
                        .bus_arrangements()
                        .map(|b| (raw(&b.inputs), raw(&b.outputs)))
                        .map_err(|e| e.to_string())
                ));
                let loaded = fresh.load_state(blob);
                fresh.start_processing().expect("새 인스턴스 처리 시작");
                let d = render(&mut fresh, &dry, in_ch, out_ch);
                write_wav(&out.join("wet-d.wav"), &d);
                log(format!(
                    "D(새 인스턴스에 상태 {:?}) A와 비교 {}",
                    loaded.err().map(|e| e.to_string()),
                    compare(&a, &d)
                ));
                let _ = fresh.stop_processing();
            }
            Err(e) => log(format!("D 새 인스턴스 로드 실패: {e}")),
        }
    }
    let _ = plugin.stop_processing();
    let dry_hash_after = fnv(&fs::read(out.join("dry.wav")).unwrap());
    log(format!(
        "dry.wav 지문 처리 전 {dry_hash_before:016x} · 후 {dry_hash_after:016x} · 같음={}",
        dry_hash_before == dry_hash_after
    ));
    finish(&out, &report);
}

/// 로드·처리·해제를 반복합니다. 메모리는 바깥에서 재며, 잘못된 입력의 오류도 확인합니다.
fn cycles(host: &mut Vst3Host) {
    let path = Path::new(r"C:\Program Files\Common Files\VST3\AmpliTube 5.vst3");
    let uid = "56535441746235616D706C6974756265";
    println!(
        "없는 경로: {:?}",
        host.load_plugin_class(Path::new(r"C:\없는\플러그인.vst3"), uid)
            .err()
            .map(|e| e.to_string())
    );
    println!(
        "잘못된 클래스: {:?}",
        host.load_plugin_class(path, "00000000000000000000000000000000")
            .err()
            .map(|e| e.to_string())
    );
    println!(
        "형식 틀린 클래스: {:?}",
        host.load_plugin_class(path, "xyz")
            .err()
            .map(|e| e.to_string())
    );
    let dry = synth_di();
    for i in 1..=5 {
        let started = Instant::now();
        let mut plugin = host.load_plugin_class(path, uid).expect("로드");
        plugin
            .set_bus_arrangements(&[SpeakerArrangement::MONO], &[SpeakerArrangement::STEREO])
            .expect("버스");
        plugin.start_processing().expect("시작");
        let wet = render(&mut plugin, &dry, 1, 2);
        plugin.stop_processing().expect("중지");
        drop(plugin);
        println!("CYCLE {i} {:?} rms {:.4}", started.elapsed(), rms(&wet[0]));
        std::thread::sleep(Duration::from_secs(3));
    }
    println!("CYCLES DONE");
    std::thread::sleep(Duration::from_secs(3));
}

fn raw(list: &[SpeakerArrangement]) -> Vec<String> {
    list.iter()
        .map(|a| format!("{:#x}({}ch)", a.raw(), a.channel_count()))
        .collect()
}

/// 기타 DI 비슷한 합성 신호: Karplus-Strong 현 네 음(E2·A2·D3·G3), 최대 약 -12dBFS, 4초.
fn synth_di() -> Vec<f32> {
    let total = (RATE * 4.0) as usize;
    let mut out = vec![0.0f32; total];
    let mut seed = 12345u32;
    for (i, freq) in [82.41f64, 110.0, 146.83, 196.0].iter().enumerate() {
        let start = i * total / 4;
        let period = (RATE / freq) as usize;
        let mut ring: Vec<f32> = (0..period)
            .map(|_| {
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
                ((seed >> 16) as f32 / 32768.0 - 1.0) * 0.25
            })
            .collect();
        for n in 0..(total / 4) {
            let k = n % period;
            let next = 0.498 * (ring[k] + ring[(k + 1) % period]);
            out[start + n] += ring[k];
            ring[k] = next;
        }
    }
    out
}

fn render(
    plugin: &mut vst3_host::Plugin,
    dry: &[f32],
    in_ch: usize,
    out_ch: usize,
) -> Vec<Vec<f32>> {
    let out_ch = out_ch.max(1);
    let mut buffers = AudioBuffers::new(in_ch.max(1), out_ch, BLOCK, RATE);
    let mut result = vec![Vec::with_capacity(dry.len()); out_ch];
    for chunk in dry.chunks(BLOCK) {
        for input in buffers.inputs.iter_mut() {
            input.fill(0.0);
            input[..chunk.len()].copy_from_slice(chunk);
        }
        for o in buffers.outputs.iter_mut() {
            o.fill(0.0);
        }
        if let Err(e) = plugin.process_audio(&mut buffers) {
            eprintln!("처리 오류: {e}");
            break;
        }
        for (c, o) in buffers.outputs.iter().enumerate() {
            result[c].extend_from_slice(&o[..chunk.len()]);
        }
    }
    result
}

fn rms(x: &[f32]) -> f64 {
    (x.iter().map(|v| (*v as f64).powi(2)).sum::<f64>() / x.len().max(1) as f64).sqrt()
}
fn peak(x: &[f32]) -> f32 {
    x.iter().fold(0.0, |m, v| m.max(v.abs()))
}
/// 출력이 입력의 단순 배율이면 상관 1에 가깝습니다. 앰프 시뮬(왜곡·필터)이면 낮아집니다.
fn correlation(a: &[f32], b: &[f32]) -> f64 {
    let n = a.len().min(b.len());
    let (mut ab, mut aa, mut bb) = (0.0f64, 0.0f64, 0.0f64);
    for i in 0..n {
        ab += a[i] as f64 * b[i] as f64;
        aa += (a[i] as f64).powi(2);
        bb += (b[i] as f64).powi(2);
    }
    if aa == 0.0 || bb == 0.0 {
        0.0
    } else {
        ab / (aa.sqrt() * bb.sqrt())
    }
}
fn describe(dry: &[f32], wet: &[Vec<f32>]) -> String {
    let silent_blocks = wet
        .first()
        .map(|c| c.chunks(BLOCK).filter(|b| peak(b) == 0.0).count())
        .unwrap_or(0);
    format!(
        "dry rms {:.4} · wet ch별 rms {:?} peak {:?} · dry와 상관 {:?} · 무음 블록 {}/{}",
        rms(dry),
        wet.iter()
            .map(|c| format!("{:.4}", rms(c)))
            .collect::<Vec<_>>(),
        wet.iter()
            .map(|c| format!("{:.3}", peak(c)))
            .collect::<Vec<_>>(),
        wet.iter()
            .map(|c| format!("{:.3}", correlation(dry, c)))
            .collect::<Vec<_>>(),
        silent_blocks,
        dry.len().div_ceil(BLOCK)
    )
}
fn compare(a: &[Vec<f32>], b: &[Vec<f32>]) -> String {
    let max_diff = a
        .iter()
        .zip(b)
        .flat_map(|(x, y)| x.iter().zip(y).map(|(p, q)| (p - q).abs()))
        .fold(0.0f32, f32::max);
    let corr: Vec<String> = a
        .iter()
        .zip(b)
        .map(|(x, y)| format!("{:.4}", correlation(x, y)))
        .collect();
    let (x, y) = (bands(&a[0]), bands(&b[0]));
    let band_db: Vec<String> = x
        .iter()
        .zip(&y)
        .map(|(p, q)| format!("{:+.1}", 10.0 * (q / p.max(1e-20)).log10()))
        .collect();
    format!("최대 차이 {max_diff:.5} · 상관 {corr:?} · 옥타브 대역 차(dB, 63Hz~8kHz) {band_db:?}")
}

/// 왼쪽 채널의 옥타브 대역(63·125·…·8000Hz 중심) 평균 에너지. 2048 샘플 창의 단순 DFT입니다.
fn bands(x: &[f32]) -> Vec<f64> {
    const N: usize = 2048;
    let centers = [63.0f64, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0];
    let mut energy = vec![0.0f64; centers.len()];
    let window: Vec<f64> = (0..N)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / N as f64).cos())
        .collect();
    for frame in x.as_chunks::<N>().0 {
        for (b, c) in centers.iter().enumerate() {
            let (lo, hi) = (
                (c / 2f64.sqrt() * N as f64 / RATE) as usize,
                (c * 2f64.sqrt() * N as f64 / RATE) as usize,
            );
            for k in lo.max(1)..=hi {
                let (mut re, mut im) = (0.0f64, 0.0f64);
                let w = -2.0 * std::f64::consts::PI * k as f64 / N as f64;
                for (n, v) in frame.iter().enumerate() {
                    let s = *v as f64 * window[n];
                    re += s * (w * n as f64).cos();
                    im += s * (w * n as f64).sin();
                }
                energy[b] += re * re + im * im;
            }
        }
    }
    energy
}

fn write_wav(path: &Path, channels: &[Vec<f32>]) {
    let frames = channels.iter().map(Vec::len).min().unwrap_or(0);
    let ch = channels.len() as u16;
    let data_len = frames as u32 * ch as u32 * 4;
    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&3u16.to_le_bytes()); // IEEE float
    bytes.extend_from_slice(&ch.to_le_bytes());
    bytes.extend_from_slice(&(RATE as u32).to_le_bytes());
    bytes.extend_from_slice(&((RATE as u32) * ch as u32 * 4).to_le_bytes());
    bytes.extend_from_slice(&(ch * 4).to_le_bytes());
    bytes.extend_from_slice(&32u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for i in 0..frames {
        for c in channels {
            bytes.extend_from_slice(&c[i].to_le_bytes());
        }
    }
    // 새 파일만 만듭니다(같은 이름이 있으면 실패).
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .and_then(|mut f| f.write_all(&bytes))
        .expect("WAV 쓰기(새 파일만)");
}

fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
        (h ^ *b as u64).wrapping_mul(0x100_0000_01b3)
    })
}

fn finish(out: &Path, report: &[String]) {
    fs::write(out.join("report.txt"), report.join("\n")).expect("보고 쓰기");
}

/// Phase 3 검사: 처리 스레드가 돌아가는 동안 별도 네이티브 창에 에디터를 열고 메시지를 돌립니다.
/// 사용: <출력 폴더> editor [초]. 창의 X를 누르면 일찍 끝납니다.
fn editor(host: &mut Vst3Host) {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };
    use windows_sys::Win32::{System::Ole::OleInitialize, UI::WindowsAndMessaging as wm};
    let seconds: u64 = std::env::args()
        .nth(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);
    let ole = unsafe { OleInitialize(std::ptr::null_mut()) };
    let path = Path::new(r"C:\Program Files\Common Files\VST3\AmpliTube 5.vst3");
    let uid = "56535441746235616D706C6974756265";
    let started = Instant::now();
    let mut plugin = host.load_plugin_class(path, uid).expect("로드");
    plugin
        .set_bus_arrangements(&[SpeakerArrangement::MONO], &[SpeakerArrangement::STEREO])
        .expect("버스");
    println!("OLE {ole} · 로드 {:?} · has_editor {}", started.elapsed(), plugin.has_editor());
    plugin.start_processing().expect("시작");
    let plugin = Arc::new(Mutex::new(plugin));
    let stop = Arc::new(AtomicBool::new(false));
    let busy_count = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let (audio_plugin, audio_stop, audio_busy) = (plugin.clone(), stop.clone(), busy_count.clone());
    let audio = std::thread::spawn(move || {
        let mut buffers = AudioBuffers::new(1, 2, 128, RATE);
        let (mut energy, mut busy, mut blocks, mut phase) = (0.0f64, 0u64, 0u64, 0.0f32);
        let mut slowest = Duration::ZERO;
        while !audio_stop.load(Ordering::Acquire) {
            for v in &mut buffers.inputs[0] {
                phase += 110.0 / RATE as f32;
                *v = (phase * std::f32::consts::TAU).sin() * 0.1;
            }
            let t = Instant::now();
            match audio_plugin.try_lock() {
                Ok(mut p) => {
                    if p.process_audio(&mut buffers).is_ok() {
                        energy += buffers.outputs[0].iter().map(|v| f64::from(*v).powi(2)).sum::<f64>();
                    }
                }
                Err(_) => {
                    busy += 1;
                    audio_busy.fetch_add(1, Ordering::Relaxed);
                }
            }
            slowest = slowest.max(t.elapsed());
            blocks += 1;
            std::thread::sleep(Duration::from_micros(2600));
        }
        (energy, busy, blocks, slowest)
    });
    let mut window = vst3_host::PluginWindow::new(plugin.clone());
    let t = Instant::now();
    let opened = window.open();
    println!(
        "에디터 열기 {:?} · {:?} · 여는 동안 잠금 충돌 {}",
        opened.as_ref().map_err(|e| e.to_string()),
        t.elapsed(),
        busy_count.load(Ordering::Relaxed)
    );
    println!("크기 {:?}", plugin.lock().unwrap().get_editor_size().map_err(|e| e.to_string()));
    let (mut edits, mut notes) = (0usize, 0usize);
    let until = Instant::now() + Duration::from_secs(seconds);
    while opened.is_ok() && Instant::now() < until {
        unsafe {
            let mut msg: wm::MSG = std::mem::zeroed();
            while wm::PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, wm::PM_REMOVE) != 0 {
                wm::TranslateMessage(&msg);
                wm::DispatchMessageW(&msg);
            }
        }
        let _ = window.service_platform_events();
        if let Ok(mut p) = plugin.try_lock() {
            edits += p.take_parameter_edits().len();
            notes += p.take_host_notifications().len();
        }
        if window.closed_by_user() {
            println!("사용자가 창을 닫음");
            break;
        }
        std::thread::sleep(Duration::from_millis(16));
    }
    window.close();
    println!("편집 {edits} · 알림 {notes} · 열린 시간 {:?}", t.elapsed());
    stop.store(true, Ordering::Release);
    let (energy, busy, blocks, slowest) = audio.join().unwrap();
    println!("처리 블록 {blocks} · 잠금 충돌 {busy} · 가장 느린 블록 {slowest:?} · 에너지 {energy:.2}");
    plugin.lock().unwrap().stop_processing().expect("중지");
    drop(window);
    drop(plugin);
    println!("EDITOR DONE");
}
