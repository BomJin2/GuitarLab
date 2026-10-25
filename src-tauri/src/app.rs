use crate::{audio, commands, judgement, recording, storage};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

pub fn builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(crate::close_guard::CloseGuard::default())
        .manage(Arc::new(audio::AudioService::default()))
        .manage(Arc::new(
            judgement::calibration_measurement::MeasurementService::default(),
        ))
        .manage(Arc::new(storage::jobs::StorageJobs::default()))
        .manage(Arc::new(crate::backing::PlayerService::default()))
        .manage(Arc::new(crate::ai::setup::SetupService::default()))
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            match crate::instance::InstanceGuard::acquire(&root) {
                Ok(instance) => {
                    app.manage(instance);
                }
                Err(cause) => {
                    if let Some(window) = app.get_webview_window("main") {
                        window.hide()?;
                    }
                    let handle = app.handle().clone();
                    app.dialog()
                        .message(cause.message())
                        .title("GuitarLab 시작 안내")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                        .show(move |_| handle.exit(1));
                    return Ok(());
                }
            }
            let diagnostics = crate::diagnostics::initialize(root.clone());
            diagnostics.record(crate::diagnostics::Code::AppStarted);
            app.manage(diagnostics.clone());
            let profiles = Arc::new(storage::calibration::ProfileStore::new(root.clone()));
            app.manage(profiles.clone());
            let projects = Arc::new(storage::projects::ProjectStore::new(root));
            if projects.initialize().is_err() {
                diagnostics.record(crate::diagnostics::Code::StorageInitFailed);
                // 저장 실패가 입력·튜너·메모리 연습까지 종료시키지 않도록 명령에서 오류를 표시합니다.
                eprintln!("GuitarLab 프로젝트 저장 초기화 실패: STORAGE_ERROR");
            }
            if projects.interrupt_recordings().is_err() {
                diagnostics.record(crate::diagnostics::Code::RecordingRecoveryInitFailed);
                eprintln!("GuitarLab 미완료 녹음 확인 실패: RECORDING_RECOVERY_INIT_FAILED");
            }
            app.manage(Arc::new(recording::service::RecordingService::new(
                app.state::<Arc<audio::AudioService>>().inner().clone(),
                projects.clone(),
                profiles,
            )));
            app.manage(Arc::new(
                judgement::practice::PracticeService::with_archive(projects.clone()),
            ));
            app.manage(projects);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                // 주 창이 파괴되면 앱 수명주기도 명시적으로 끝냅니다.
                window.app_handle().exit(0);
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                let mut blocked = false;
                if window
                    .try_state::<Arc<recording::service::RecordingService>>()
                    .is_some_and(|service| service.storage_busy())
                {
                    blocked = true;
                    api.prevent_close();
                    if window.emit("backup-close-blocked", ()).is_err() {
                        eprintln!("GuitarLab 백업 종료 안내 실패: BACKUP_CLOSE_NOTICE_FAILED");
                    }
                }
                if window
                    .try_state::<Arc<crate::ai::setup::SetupService>>()
                    .is_some_and(|service| service.is_active())
                {
                    blocked = true;
                    api.prevent_close();
                    if window.emit("ai-installation-close-blocked", ()).is_err() {
                        eprintln!("GuitarLab 설치 종료 안내 실패: AI_SETUP_CLOSE_NOTICE_FAILED");
                    }
                }
                if window
                    .try_state::<Arc<recording::service::RecordingService>>()
                    .is_some_and(|service| service.is_active())
                {
                    blocked = true;
                    api.prevent_close();
                    if window.emit("recording-close-blocked", ()).is_err() {
                        eprintln!("GuitarLab 녹음 저장 안내 실패: RECORDING_CLOSE_NOTICE_FAILED");
                    }
                }
                if window
                    .state::<Arc<storage::jobs::StorageJobs>>()
                    .is_active()
                {
                    blocked = true;
                    api.prevent_close();
                }
                if blocked && window.emit("application-close-blocked", ()).is_err() {
                    eprintln!("GuitarLab 파일 종료 안내 실패: STORAGE_CLOSE_NOTICE_FAILED");
                }
                match window
                    .state::<crate::close_guard::CloseGuard>()
                    .on_close(blocked, std::time::Instant::now())
                {
                    Ok(crate::close_guard::Decision::Allow) => {}
                    Ok(crate::close_guard::Decision::Block) => api.prevent_close(),
                    Ok(crate::close_guard::Decision::AskFrontend(intent)) => {
                        api.prevent_close();
                        if window.emit("application-close-requested", intent).is_err() {
                            eprintln!("GuitarLab 종료 상태 요청 실패: CLOSE_NOTICE_FAILED");
                        }
                    }
                    Ok(crate::close_guard::Decision::AskFallback(intent)) => {
                        api.prevent_close();
                        crate::close_guard::confirm_close(
                            window.app_handle(),
                            intent.request_id,
                            true,
                        );
                    }
                    Err(_) => api.prevent_close(),
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::close_api::enable_close_guard,
            commands::close_api::resolve_close_request,
            commands::project_trash_api::list_trashed_projects,
            commands::project_trash_api::trash_project,
            commands::project_trash_api::restore_trashed_project,
            commands::project_trash_api::inspect_trashed_project_usage,
            commands::ai_api::inspect_ai_runtime,
            commands::backup_api::backup_local_data,
            commands::backup_api::verify_local_backup,
            commands::backup_api::preview_local_backup,
            commands::diagnostics_api::get_local_diagnostics,
            commands::cache_cleanup_api::inspect_model_download_cache,
            commands::cache_cleanup_api::clear_model_download_cache,
            commands::ai_api::verify_ai_model,
            commands::ai_api::download_ai_model,
            commands::ai_api::install_ai_model,
            commands::ai_api::transcribe_project_audio,
            commands::ai_api::restore_transcription_draft,
            commands::ai_api::separate_project_audio,
            commands::ai_api::restore_project_separation,
            commands::list_audio_devices,
            commands::start_audio_input,
            commands::stop_audio_input,
            commands::get_audio_snapshot,
            commands::get_audio_clock,
            commands::monitor_api::list_monitor_outputs,
            commands::monitor_api::start_input_monitor,
            commands::monitor_api::stop_input_monitor,
            commands::monitor_api::get_input_monitor,
            commands::monitor_api::set_input_monitor_volume,
            commands::update_capture_clock,
            commands::list_input_calibrations,
            commands::save_input_calibration,
            commands::start_calibration_measurement,
            commands::get_calibration_measurement,
            commands::cancel_calibration_measurement,
            commands::save_measured_calibration,
            commands::start_practice_attempt,
            commands::get_practice_attempt,
            commands::stop_practice_attempt,
            commands::storage_api::create_project,
            commands::backing_api::get_project_backing,
            commands::backing_api::save_backing_selection,
            commands::youtube_sync_api::get_youtube_sync,
            commands::youtube_sync_api::save_youtube_sync,
            commands::imported_stem_api::import_guitar_stem,
            commands::imported_stem_api::list_imported_guitar_stems,
            commands::imported_stem_api::read_imported_guitar_stem,
            commands::youtube_api::open_youtube_player,
            commands::youtube_api::close_youtube_player,
            commands::storage_api::list_projects,
            commands::storage_api::open_project,
            commands::storage_api::save_project_revision,
            commands::storage_api::pick_project_asset,
            commands::storage_api::create_blank_project_score,
            commands::storage_api::relink_project_asset,
            commands::storage_api::read_project_asset,
            commands::storage_api::get_storage_job,
            commands::storage_api::cancel_storage_job,
            commands::storage_api::take_storage_bytes,
            commands::storage_api::list_practice_records,
            commands::storage_api::list_practice_events,
            commands::recording_api::start_recording,
            commands::recording_api::get_recording,
            commands::recording_api::stop_recording,
            commands::recording_api::list_recordings,
            commands::recording_api::read_recording,
            commands::recording_api::export_recording,
            commands::recording_api::analyze_recording_pitches,
            commands::recording_api::analyze_recording_pitch_track,
            commands::recording_api::recover_recording,
            commands::recording_api::update_recording,
            commands::recording_api::get_recording_revision,
            commands::mixer_api::get_project_mix,
            commands::mixer_api::read_project_stem,
            commands::mixer_api::save_project_mix,
            commands::mixer_api::render_project_mix,
            commands::mixer_api::export_project_mix,
            commands::score_api::export_score_file,
        ])
}
