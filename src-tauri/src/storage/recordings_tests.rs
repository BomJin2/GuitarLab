use super::{
    database::connect,
    project_model::*,
    projects::*,
    projects_tests::{score, workspace, Fixture},
};
use crate::{
    recording::{model::*, wave},
    storage::calibration::{DeviceProfile, MonitorEnvironment, ProfileKey},
};
use std::{fs, io::Write, sync::atomic::AtomicBool};
use uuid::Uuid;

pub(crate) fn prepared(f: &Fixture) -> RecordedTake {
    let project = f.project();
    let asset = f.asset(&project, AssetStorage::Managed);
    let revision = f
        .store
        .save_revision(
            &project,
            0,
            &asset,
            score(),
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("악보 저장");
    RecordedTake {
        schema_version: 1,
        id: Uuid::new_v4().to_string(),
        project_id: project,
        score_revision_id: revision.revision_id,
        target_score_track_id: "track-0".into(),
        name: "합성 입력 fixture".into(),
        memo: String::new(),
        created_at_ms: now_ms().expect("시각") as u64,
        origin: TakeOrigin::UserInput,
        source: RecordSource::InputOnly,
        state: RecordingState::Arming,
        sample_rate: 48000,
        channels: 1,
        frames: 0,
        peak: 0.0,
        dropped_frames: 0,
        warning_intervals: vec![],
        error_code: None,
        capture_start_sample_index: None,
        capture_start_monotonic_ns: None,
        stream_generation: 1,
        calibration_revision: 1,
        calibration: DeviceProfile {
            id: Uuid::new_v4().to_string(),
            key: ProfileKey {
                device_id: "synthetic-input-only".into(),
                sample_rate: 48000,
                sample_format: "f32".into(),
                channels: 2,
                channel_index: 1,
                buffer_frames: 480,
                monitor_environment: MonitorEnvironment::Headphones,
            },
            bias_real_ms: 30.0,
            method: "MANUAL".into(),
            jitter_real_ms: None,
            samples_used: None,
        },
        transport: None,
        song_start_ms: None,
        alignment_offset_ms: 0.0,
        recovered_from: None,
        sha256: None,
        reference_take_ids: vec![],
    }
}
pub(crate) fn write_part(f: &Fixture, take: &mut RecordedTake, frames: u64, finish: bool) {
    let path = f.store.prepare_recording(take).expect("테이크 준비");
    let mut writer = wave::create(&path, 48000).expect("새 WAV");
    for i in 0..frames {
        writer
            .push((i as f32 * 0.01).sin() * 0.7)
            .expect("합성 입력");
    }
    take.frames = writer.frames;
    take.peak = writer.peak;
    writer.flush().expect("청크 flush");
    if finish {
        wave::finish(writer).expect("WAV 확정");
    }
}

#[test]
#[ignore = "부모 복구 검사에서 고정된 합성 임시 경로로만 실행하는 자식 프로세스"]
fn unfinished_wave_crash_child() {
    let payload = std::env::var("GUITARLAB_TEST_UNFINISHED_WAVE").expect("부모 검사 입력");
    assert!(payload.len() <= 4096, "자식 검사 입력 한도");
    let [root, project, take]: [String; 3] =
        serde_json::from_str(&payload).expect("고정 검사 입력");
    let root = std::path::PathBuf::from(root)
        .canonicalize()
        .expect("자체 임시 앱 경로");
    let fixture = root.parent().expect("자체 fixture");
    assert_eq!(
        fixture.parent(),
        Some(
            std::env::temp_dir()
                .canonicalize()
                .expect("임시 상위")
                .as_path()
        )
    );
    let name = fixture
        .file_name()
        .and_then(|value| value.to_str())
        .expect("임시 폴더명");
    Uuid::parse_str(
        name.strip_prefix("guitarlab-project-test-")
            .expect("자체 fixture 이름"),
    )
    .expect("자체 fixture UUID");
    assert_eq!(
        root.file_name().and_then(|value| value.to_str()),
        Some("앱 데이터")
    );
    let project = Uuid::parse_str(&project).expect("프로젝트 UUID");
    let take = Uuid::parse_str(&take).expect("테이크 UUID");
    let relative = format!("projects/{project}/recordings/{take}/dry.wav.part");
    let path = super::database::checked_file(&root, std::path::Path::new(&relative))
        .expect("자체 부분 파일 경로");
    let mut writer = wave::create(&path, 48000).expect("새 합성 부분 WAV");
    for _ in 0..48000 {
        writer.push(0.25).expect("flush할 합성 프레임");
    }
    writer.flush().expect("복구 가능한 prefix flush");
    for _ in 0..1234 {
        writer.push(0.5).expect("flush하지 않은 합성 프레임");
    }
    // 사용자 공간 버퍼와 헤더를 확정하는 Drop/finish 없이 테스트 자식만 끝냅니다.
    std::process::exit(73);
}

#[test]
fn abrupt_process_exit_recovers_flushed_prefix_to_new_take_preserving_original() {
    use std::{
        process::{Command, Stdio},
        thread,
        time::{Duration, Instant},
    };

    let f = Fixture::new();
    let take = prepared(&f);
    let revision = f
        .store
        .revision(&take.project_id, &take.score_revision_id)
        .expect("기존 악보");
    let revision_bytes = serde_json::to_vec(&revision).expect("악보 snapshot");
    let partial = f.store.prepare_recording(&take).expect("합성 테이크 준비");
    let payload = serde_json::to_string(&[
        f.store.root.to_string_lossy().into_owned(),
        take.project_id.clone(),
        take.id.clone(),
    ])
    .expect("고정 자식 검사 입력");
    let mut command = Command::new(std::env::current_exe().expect("현재 테스트 실행 파일"));
    command
        .args([
            "--ignored",
            "--exact",
            "storage::recordings_tests::unfinished_wave_crash_child",
        ])
        .env("GUITARLAB_TEST_UNFINISHED_WAVE", payload)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().expect("합성 검사 자식 실행");
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().expect("검사 자식 상태") {
            break status;
        }
        if start.elapsed() > Duration::from_secs(10) {
            child.kill().expect("자체 검사 자식 시간 초과 정리");
            child.wait().expect("자체 검사 자식 회수");
            panic!("합성 녹음 자식 검사 시간 초과");
        }
        thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(status.code(), Some(73));
    let original = fs::read(&partial).expect("비정상 종료 뒤 원본 part");
    assert_eq!(original.len(), wave::HEADER_BYTES as usize + 48000 * 4);
    assert_eq!(&original[54..58], &[0; 4]);
    assert!(wave::WaveReader::open(&partial, false).is_err());
    let reopened = ProjectStore::new(f.store.root.clone());
    reopened.initialize().expect("별도 저장소 재열기");
    reopened.interrupt_recordings().expect("중단 테이크 분리");
    let interrupted = reopened
        .take(&take.project_id, &take.id)
        .expect("중단 원본 metadata");
    assert!(interrupted.state == RecordingState::RecoverableError);
    let recovered = reopened
        .recover_recording(
            &take.project_id,
            &take.id,
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("새 테이크로 비파괴 복구");
    assert_ne!(recovered.id, take.id);
    assert_eq!(recovered.frames, 48000);
    assert_eq!(recovered.recovered_from, Some(take.id.clone()));
    assert!(recovered.state == RecordingState::Ready);
    let restored = reopened
        .recording_bytes(&take.project_id, &recovered.id, &AtomicBool::new(false))
        .expect("정상 복구 WAV");
    assert_eq!(&restored[58..], &original[58..]);
    assert_eq!(fs::read(&partial).expect("원본 part 보존"), original);
    assert_eq!(
        serde_json::to_vec(
            &reopened
                .take(&take.project_id, &take.id)
                .expect("원본 metadata 보존")
        )
        .expect("원본 metadata 직렬화"),
        serde_json::to_vec(&interrupted).expect("중단 metadata 직렬화")
    );
    assert_eq!(
        serde_json::to_vec(
            &reopened
                .revision(&take.project_id, &take.score_revision_id)
                .expect("악보 보존")
        )
        .expect("악보 직렬화"),
        revision_bytes
    );
}
#[test]
fn four_second_take_reopens_with_edits_without_changing_original_or_revision() {
    let f = Fixture::new();
    let mut take = prepared(&f);
    let revision = f
        .store
        .revision(&take.project_id, &take.score_revision_id)
        .expect("원본 리비전");
    let original = serde_json::to_vec(&revision).expect("리비전");
    write_part(&f, &mut take, 192000, true);
    f.store.finalize_take(&mut take).expect("승격/DB");
    let bytes = f
        .store
        .recording_bytes(&take.project_id, &take.id, &AtomicBool::new(false))
        .expect("다시 듣기 데이터");
    assert_eq!(bytes.len(), 768058);
    assert_eq!(&bytes[46..50], &192000u32.to_le_bytes());
    assert!(take.peak > 0.699);
    assert!(wave::create(
        &f.store.recording_path(&take, false).expect("원본 경로"),
        48000
    )
    .is_err());
    let saved = f
        .store
        .update_recording(
            &take.project_id,
            &take.id,
            "리드 take".into(),
            "비파괴 메모".into(),
            -12.5,
        )
        .expect("메타데이터");
    assert_eq!(saved.alignment_offset_ms, -12.5);
    let reopened = ProjectStore::new(f.store.root.clone());
    reopened.initialize().expect("재실행");
    reopened.interrupt_recordings().expect("중단 확인");
    assert_eq!(
        reopened.recordings(&take.project_id).expect("목록")[0].name,
        "리드 take"
    );
    assert_eq!(
        reopened
            .recording_bytes(&take.project_id, &take.id, &AtomicBool::new(false))
            .expect("원본 보존"),
        bytes
    );
    assert_eq!(
        serde_json::to_vec(
            &reopened
                .revision(&take.project_id, &take.score_revision_id)
                .expect("리비전 보존")
        )
        .expect("직렬화"),
        original
    );
    assert!(reopened
        .recording_bytes(&take.project_id, &take.id, &AtomicBool::new(true))
        .is_err());
    fs::OpenOptions::new()
        .append(true)
        .open(reopened.recording_path(&take, false).expect("경로"))
        .expect("자체 손상 fixture")
        .write_all(&[1])
        .expect("손상");
    assert!(reopened
        .recording_bytes(&take.project_id, &take.id, &AtomicBool::new(false))
        .is_err());
}
#[test]
fn unfinished_header_and_trailing_partial_frame_recover_to_new_id_preserving_bytes() {
    let f = Fixture::new();
    let mut take = prepared(&f);
    write_part(&f, &mut take, 4096, false);
    let path = f.store.recording_path(&take, true).expect(".part");
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .expect("fixture")
        .write_all(&[1, 2])
        .expect("미완성 프레임");
    let original = fs::read(&path).expect("원본");
    f.store.interrupt_recordings().expect("크래시 복구 상태");
    let interrupted = f.store.take(&take.project_id, &take.id).expect("조회");
    assert!(interrupted.state == RecordingState::RecoverableError);
    let recovered = f
        .store
        .recover_recording(
            &take.project_id,
            &take.id,
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("사용자 명시적 복구");
    assert_ne!(recovered.id, take.id);
    assert_eq!(recovered.frames, 4096);
    assert_eq!(recovered.recovered_from, Some(take.id.clone()));
    assert_eq!(recovered.error_code.as_deref(), Some("RECOVERED_PARTIAL"));
    assert_eq!(fs::read(path).expect("미완성 원본 보존"), original);
    assert!(
        f.store
            .take(&take.project_id, &take.id)
            .expect("이전 상태")
            .state
            == RecordingState::RecoverableError
    );
    assert_eq!(
        f.store
            .recordings(&take.project_id)
            .expect("분리된 테이크")
            .len(),
        2
    );
    assert_eq!(
        f.store
            .recording_bytes(
                &recovered.project_id,
                &recovered.id,
                &AtomicBool::new(false)
            )
            .expect("복구 PCM")[58..],
        original[58..58 + 4096 * 4]
    );
}
#[test]
fn crash_after_rename_and_cancelled_or_corrupt_recovery_never_overwrites_input() {
    let f = Fixture::new();
    let mut take = prepared(&f);
    write_part(&f, &mut take, 64, true);
    let partial = f.store.recording_path(&take, true).expect("부분 경로");
    let final_path = f.store.recording_path(&take, false).expect("완성 경로");
    fs::rename(&partial, &final_path).expect("rename 후 commit 전 크래시 fixture");
    let original = fs::read(&final_path).expect("원본");
    f.store.interrupt_recordings().expect("중단 상태");
    assert!(f
        .store
        .recover_recording(
            &take.project_id,
            &take.id,
            &AtomicBool::new(true),
            |_, _| Ok(())
        )
        .is_err());
    let recovered = f
        .store
        .recover_recording(
            &take.project_id,
            &take.id,
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("승격 파일 복구");
    assert_eq!(fs::read(final_path).expect("원본 보존"), original);
    assert_eq!(recovered.frames, 64);
    let mut bad = prepared(&f);
    write_part(&f, &mut bad, 32, false);
    let path = f.store.recording_path(&bad, true).expect("NaN fixture");
    let mut bytes = fs::read(&path).expect("읽기");
    bytes[58..62].copy_from_slice(&f32::NAN.to_le_bytes());
    fs::write(&path, &bytes).expect("자체 손상");
    f.store.interrupt_recordings().expect("중단");
    assert!(f
        .store
        .recover_recording(
            &bad.project_id,
            &bad.id,
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .is_err());
    assert_eq!(fs::read(path).expect("NaN 원본 보존"), bytes);
}
#[test]
fn version_one_migrates_without_changing_projects_and_input_source_contract_is_strict() {
    let f = Fixture::new();
    let legacy = f.store.root.join("legacy");
    fs::create_dir(&legacy).expect("이전 DB 폴더");
    let db = rusqlite::Connection::open(legacy.join("guitarlab.sqlite")).expect("v1 DB");
    db.execute_batch(include_str!("migrations/001-projects.sql"))
        .expect("기존 migration001");
    db.execute("INSERT INTO projects(id,title,mode,created_at_ms,updated_at_ms) VALUES(?1,'기존 프로젝트','practice',1,1)",[Uuid::new_v4().to_string()]).expect("기존 데이터");
    drop(db);
    let db = connect(&legacy).expect("추가 migration002/003");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
            .expect("v9"),
        9
    );
    assert_eq!(
        db.query_row("SELECT title FROM projects", [], |r| r.get::<_, String>(0))
            .expect("기존 프로젝트"),
        "기존 프로젝트"
    );
    let take = prepared(&f);
    let request = serde_json::json!({"schemaVersion":1,"projectId":take.project_id,"scoreRevisionId":take.score_revision_id,"targetScoreTrackId":take.target_score_track_id,"expectedStreamGeneration":1,"monitorEnvironment":"HEADPHONES","source":"INPUT_ONLY","transport":null});
    assert!(
        serde_json::from_value::<StartRecordingRequest>(request.clone())
            .expect("요청")
            .validate()
            .is_ok()
    );
    for source in ["LOOPBACK", "SYSTEM", "YOUTUBE", "MIXED"] {
        let mut bad = request.clone();
        bad["source"] = source.into();
        assert!(serde_json::from_value::<StartRecordingRequest>(bad).is_err());
    }
    let mut bad = request.clone();
    bad["path"] = "../../audio.wav".into();
    assert!(serde_json::from_value::<StartRecordingRequest>(bad).is_err());
    let mut deferred = request.clone();
    deferred["deferTransport"] = true.into();
    assert!(
        serde_json::from_value::<StartRecordingRequest>(deferred.clone())
            .expect("지연 요청 구조")
            .validate()
            .is_err()
    );
    deferred["transport"] = serde_json::json!({"playbackEpoch":1,"rate":1.0,"backingAssetId":Uuid::new_v4().to_string()});
    serde_json::from_value::<StartRecordingRequest>(deferred.clone())
        .expect("로컬 지연 요청")
        .validate()
        .expect("정상 지연 계약");
    deferred["deferTransport"] = "yes".into();
    assert!(serde_json::from_value::<StartRecordingRequest>(deferred).is_err());
    assert!(f
        .store
        .recordings(&take.project_id)
        .expect("REC 전 없음")
        .is_empty());
    assert!(!f
        .store
        .root
        .join(format!("projects/{}/recordings", take.project_id))
        .exists());
}

#[test]
fn bounded_input_route_writer_saves_exact_four_seconds_and_retains_failed_prefix() {
    use crate::{
        audio::{dsp::Sample, RecordingCapture},
        recording::{
            router::{RecordingMessage, RecordingRoute, RecordingRouter},
            service::write_input,
        },
    };
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    };
    let f = Fixture::new();
    for failed in [false, true] {
        let mut take = prepared(&f);
        let path = f.store.prepare_recording(&take).expect("REC 준비");
        let writer = wave::create(&path, 48000).expect("파일");
        let (sender, receiver) = mpsc::sync_channel(192001);
        let end = Arc::new(AtomicU64::new(5_000_000_000));
        let dropped = Arc::new(AtomicU64::new(0));
        let route = RecordingRoute {
            sender,
            start_ns: 1_000_000_000,
            started: Arc::new(AtomicBool::new(false)),
            end_ns: end.clone(),
            dropped: dropped.clone(),
        };
        let frames = if failed { 2 } else { 192000 };
        for i in 0..frames {
            let nominal = 1_000_000_000 + i * 1_000_000_000 / 48000;
            let block = i / 480;
            let captured_ns = match block {
                0 => nominal,
                b if b % 2 == 0 => nominal + 200_000,
                _ => nominal - 200_000,
            };
            route.push(Sample {
                value: (i as f32 * 0.01).sin() * 0.5,
                index: i + 500,
                captured_ns,
            });
        }
        if failed {
            route.push(Sample {
                value: 0.0,
                index: 504,
                captured_ns: 1_000_083_333,
            });
        }
        assert!(route.sender.try_send(RecordingMessage::Boundary).is_ok());
        let origin = RecordingCapture {
            key: take.calibration.key.clone(),
            now_ns: 1_000_000_000,
            song_time_ms: None,
        };
        let shared = Mutex::new(take.clone());
        write_input(
            writer,
            receiver,
            &mut take,
            &origin,
            &RecordingRouter::default(),
            |_| {
                Ok(RecordingCapture {
                    key: origin.key.clone(),
                    now_ns: 5_000_000_000,
                    song_time_ms: None,
                })
            },
            &f.store,
            &shared,
            &end,
            &dropped,
        );
        assert_eq!(dropped.load(Ordering::Relaxed), 0);
        if failed {
            assert!(take.state == RecordingState::RecoverableError);
            assert_eq!(take.error_code.as_deref(), Some("INPUT_GAP"));
            assert_eq!(take.frames, 2);
            assert!(path.exists());
            assert!(!f.store.recording_path(&take, false).expect("경로").exists());
        } else {
            assert!(take.state == RecordingState::Ready);
            assert_eq!(take.frames, 192000);
            assert_eq!(take.capture_start_sample_index.as_deref(), Some("500"));
            let data = f
                .store
                .recording_bytes(&take.project_id, &take.id, &AtomicBool::new(false))
                .expect("완성 PCM");
            assert_eq!(data.len(), 768058);
            assert_eq!(
                &data[58 + 12345 * 4..58 + 12346 * 4],
                &((12345f32 * 0.01).sin() * 0.5).to_le_bytes()
            );
        }
    }
}

#[test]
fn writer_disconnect_nonfinite_overflow_and_clock_failure_preserve_recoverable_audio() {
    use crate::{
        audio::{dsp::Sample, RecordingCapture},
        ipc::AppError,
        recording::{
            router::{RecordingMessage, RecordingRouter},
            service::write_input,
        },
    };
    use std::sync::{atomic::AtomicU64, mpsc, Mutex};
    let f = Fixture::new();
    for code in [
        "INPUT_NOT_ACTIVE",
        "NONFINITE_INPUT",
        "RECORDING_QUEUE_FULL",
        "CLOCK_UNCERTAIN",
    ] {
        let mut take = prepared(&f);
        let path = f.store.prepare_recording(&take).expect("준비");
        let writer = wave::create(&path, 48000).expect("WAV");
        let (sender, receiver) = mpsc::sync_channel(8);
        for i in 0..2 {
            assert!(sender
                .try_send(RecordingMessage::Sample(Sample {
                    value: 0.5,
                    index: i,
                    captured_ns: 1_000_000_000 + i * 20833
                }))
                .is_ok());
        }
        if code == "NONFINITE_INPUT" {
            assert!(sender
                .try_send(RecordingMessage::Sample(Sample {
                    value: f32::NAN,
                    index: 2,
                    captured_ns: 1_000_041_666
                }))
                .is_ok());
        }
        if code == "RECORDING_QUEUE_FULL" {
            assert!(sender.try_send(RecordingMessage::Boundary).is_ok());
        }
        let retained_sender = if code == "CLOCK_UNCERTAIN" {
            Some(sender)
        } else {
            drop(sender);
            None
        };
        let origin = RecordingCapture {
            key: take.calibration.key.clone(),
            now_ns: 1_000_000_000,
            song_time_ms: None,
        };
        let shared = Mutex::new(take.clone());
        let dropped = AtomicU64::new(if code == "RECORDING_QUEUE_FULL" { 2 } else { 0 });
        write_input(
            writer,
            receiver,
            &mut take,
            &origin,
            &RecordingRouter::default(),
            |_| {
                // 저장 I/O가 느려도 각 실패 원인을 분리하고 앞의 두 샘플을 먼저 발행합니다.
                if code == "CLOCK_UNCERTAIN" && shared.lock().expect("테스트 상태").frames >= 2
                {
                    Err(AppError::new("CLOCK_UNCERTAIN", "테스트 clock 실패", true))
                } else {
                    Ok(RecordingCapture {
                        key: origin.key.clone(),
                        now_ns: 1_000_041_666,
                        song_time_ms: None,
                    })
                }
            },
            &f.store,
            &shared,
            &AtomicU64::new(u64::MAX),
            &dropped,
        );
        drop(retained_sender);
        assert!(take.state == RecordingState::RecoverableError);
        assert_eq!(take.error_code.as_deref(), Some(code));
        assert_eq!(take.frames, 2);
        let bytes = fs::read(&path).expect("연속된 앞부분 보존");
        assert_eq!(bytes.len(), 66);
        let recovered = f
            .store
            .recover_recording(
                &take.project_id,
                &take.id,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("복구");
        assert_eq!(recovered.frames, 2);
        assert_eq!(fs::read(path).expect("원본 불변"), bytes);
    }
}

#[test]
fn deferred_recording_keeps_early_pcm_and_never_marks_unmapped_audio_ready() {
    use crate::{
        audio::{dsp::Sample, RecordingCapture},
        recording::{
            router::{RecordingMessage, RecordingRouter},
            service::write_input,
        },
    };
    use std::{
        sync::{
            atomic::{AtomicU64, AtomicUsize, Ordering},
            mpsc, Mutex,
        },
        time::Duration,
    };
    let f = Fixture::new();
    for bind in [true, false] {
        let mut take = prepared(&f);
        let backing = f
            .store
            .root
            .join(format!("own-backing-{}.wav", Uuid::new_v4()));
        let mut wav = wave::create(&backing, 48000).expect("자체 반주");
        wav.push(0.1).expect("합성 표본");
        wave::finish(wav).expect("반주 확정");
        let asset = f
            .store
            .import_asset(
                &take.project_id,
                &backing,
                AssetKind::Original,
                AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("로컬 반주")
            .asset;
        take.transport = Some(RecordingTransport {
            playback_epoch: 1,
            rate: 1.0,
            backing_asset_id: asset.id,
        });
        let path = f.store.prepare_recording(&take).expect("ARMING");
        let writer = wave::create(&path, 48000).expect("입력 원본");
        let (sender, receiver) = mpsc::sync_channel(192001);
        let send = |start: u64, end: u64| {
            for i in start..end {
                sender
                    .send(RecordingMessage::Sample(Sample {
                        value: if i == 0 { 0.75 } else { 0.25 },
                        index: i,
                        captured_ns: 1_000_000_000 + i * 1_000_000_000 / 48000,
                    }))
                    .expect("합성 입력");
            }
        };
        send(0, 48000);
        let (probe, observed) = mpsc::channel();
        let calls = AtomicUsize::new(0);
        let origin = RecordingCapture {
            key: take.calibration.key.clone(),
            now_ns: 1_000_000_000,
            song_time_ms: None,
        };
        let shared = Mutex::new(take.clone());
        let store = &f.store;
        std::thread::scope(|scope| {
            let take_ref = &mut take;
            scope.spawn(move || {
                write_input(
                    writer,
                    receiver,
                    take_ref,
                    &origin,
                    &RecordingRouter::default(),
                    |transport| {
                        let song_time_ms = if transport.is_some() {
                            let n = calls.fetch_add(1, Ordering::SeqCst) + 1;
                            probe.send(n).expect("연결 관측");
                            if !bind || n == 1 {
                                return Err(record_error("CLOCK_UNCERTAIN"));
                            }
                            Some(500.0)
                        } else {
                            None
                        };
                        Ok(RecordingCapture {
                            key: origin.key.clone(),
                            now_ns: 1_500_000_000,
                            song_time_ms,
                        })
                    },
                    store,
                    &shared,
                    &AtomicU64::new(u64::MAX),
                    &AtomicU64::new(0),
                )
            });
            assert_eq!(
                observed
                    .recv_timeout(Duration::from_secs(3))
                    .expect("clock 준비 대기"),
                1
            );
            if bind {
                send(48000, 192000);
                assert_eq!(
                    observed
                        .recv_timeout(Duration::from_secs(3))
                        .expect("시각 연결"),
                    2
                );
            }
            sender.send(RecordingMessage::Boundary).expect("STOP 경계");
        });
        if bind {
            assert!(take.state == RecordingState::Ready);
            assert_eq!(take.frames, 192000);
            assert_eq!(take.song_start_ms, Some(-30.0));
            let bytes = f
                .store
                .recording_bytes(&take.project_id, &take.id, &AtomicBool::new(false))
                .expect("4초 원본");
            assert_eq!(bytes.len(), 768058);
            assert_eq!(&bytes[58..62], &0.75f32.to_le_bytes());
        } else {
            assert!(take.state == RecordingState::RecoverableError);
            assert_eq!(take.error_code.as_deref(), Some("CLOCK_UNCERTAIN"));
            assert_eq!(take.frames, 48000);
            assert!(take.song_start_ms.is_none());
            assert_eq!(
                fs::metadata(path).expect("미연결 원본 보존").len(),
                58 + 48000 * 4
            );
        }
    }
}
