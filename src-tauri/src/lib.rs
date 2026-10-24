pub mod ai;
mod app;
pub mod audio;
pub mod backing;
mod close_guard;
mod commands;
mod diagnostics;
pub mod instance;
pub mod ipc;
pub mod judgement;
pub mod mixer;
pub mod recording;
pub mod storage;

pub fn run() {
    match app::builder().build(tauri::generate_context!()) {
        Ok(app) => app.run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                diagnostics::finish(false);
            }
        }),
        Err(_) => {
            diagnostics::finish(true);
            eprintln!("GuitarLab 시작 실패: APP_START_FAILED");
            std::process::exit(1);
        }
    }
}

#[cfg(all(test, feature = "custom-protocol"))]
mod bundle_tests {
    #[test]
    fn local_main_can_receive_recording_notice_without_emit_or_remote_access() {
        let mut context: tauri::Context<tauri::Wry> = tauri::generate_context!();
        let authority = context.runtime_authority_mut();
        for command in [
            "plugin:event|listen",
            "plugin:event|unlisten",
            "plugin:dialog|message",
        ] {
            assert!(authority
                .resolve_access(command, "main", "main", &tauri::ipc::Origin::Local)
                .is_some());
            assert!(authority
                .resolve_access(command, "other", "other", &tauri::ipc::Origin::Local)
                .is_none());
            assert!(authority
                .resolve_access(
                    command,
                    "main",
                    "main",
                    &tauri::ipc::Origin::Remote {
                        url: "https://example.invalid".parse().expect("테스트 URL"),
                    },
                )
                .is_none());
        }
        for command in [
            "plugin:event|emit",
            "plugin:event|emit_to",
            "plugin:window|destroy",
            "plugin:window|close",
            "plugin:dialog|open",
            "plugin:dialog|save",
        ] {
            assert!(authority
                .resolve_access(command, "main", "main", &tauri::ipc::Origin::Local)
                .is_none());
        }
        for url in [
            "https://www.youtube.com/embed/Ab_cD-12345",
            "https://www.youtube.com",
            "http://127.0.0.1:55555/00000000-0000-4000-8000-000000000001/player.html",
        ] {
            assert!(authority
                .resolve_access(
                    "plugin:event|listen",
                    "main",
                    "main",
                    &tauri::ipc::Origin::Remote {
                        url: url.parse().expect("테스트 URL")
                    }
                )
                .is_none());
            for command in [
                "plugin:dialog|message",
                "open_project",
                "enable_close_guard",
                "resolve_close_request",
                "list_trashed_projects",
                "trash_project",
                "restore_trashed_project",
                "inspect_trashed_project_usage",
                "backup_local_data",
                "verify_local_backup",
                "preview_local_backup",
                "get_local_diagnostics",
                "inspect_model_download_cache",
                "clear_model_download_cache",
                "start_recording",
                "create_blank_project_score",
                "open_youtube_player",
                "save_backing_selection",
                "get_youtube_sync",
                "save_youtube_sync",
                "import_guitar_stem",
                "list_imported_guitar_stems",
                "read_imported_guitar_stem",
                "analyze_recording_pitches",
                "analyze_recording_pitch_track",
            ] {
                assert!(authority
                    .resolve_access(
                        command,
                        "main",
                        "main",
                        &tauri::ipc::Origin::Remote {
                            url: url.parse().expect("원격 origin")
                        }
                    )
                    .is_none());
            }
        }
    }

    #[test]
    fn youtube_frame_policy_does_not_grant_remote_script_or_network_access_to_app() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("테스트 설정");
        let csp = config["app"]["security"]["csp"].as_str().expect("CSP");
        assert!(csp
            .split(';')
            .any(|value| value.trim() == "frame-src https://www.youtube.com http://127.0.0.1:*"));
        assert!(csp
            .split(';')
            .any(|value| value.trim() == "connect-src 'self' ipc: http://ipc.localhost"));
        assert!(!csp.contains("script-src https:"));
        assert_eq!(csp.matches('*').count(), 1);
        assert!(!csp.contains("http://localhost"));
    }

    #[test]
    fn bundled_context_contains_frontend_entry_and_script() {
        let context: tauri::Context<tauri::Wry> = tauri::generate_context!();
        assert!(matches!(
            context.config().build.frontend_dist,
            Some(tauri::utils::config::FrontendDist::Directory(_))
        ));
        let keys: Vec<_> = context.assets().iter().map(|(key, _)| key).collect();
        assert!(keys
            .iter()
            .any(|key| key.trim_start_matches('/') == "index.html"));
        assert!(keys.iter().any(|key| {
            key.trim_start_matches('/').starts_with("assets/") && key.ends_with(".js")
        }));
        let fixtures = [
            "standard.musicxml",
            "dual-guitar.musicxml",
            "standard.gp",
            "sine.wav",
            "sine.mp3",
        ];
        for fixture in fixtures {
            assert!(
                keys.iter()
                    .any(|key| key.trim_start_matches('/') == format!("fixtures/{fixture}")),
                "자체 fixture가 반드시 내장돼야 합니다"
            );
        }
        let xml = context
            .assets()
            .get(&"fixtures/standard.musicxml".into())
            .expect("내장 XML");
        assert_eq!(
            xml.as_ref(),
            &include_bytes!("../../public/fixtures/standard.musicxml")[..]
        );
        for key in &keys {
            if let Some(name) = key.trim_start_matches('/').strip_prefix("fixtures/") {
                assert!(
                    fixtures.contains(&name),
                    "사용자 산출물이 번들에 포함되면 안 됩니다"
                );
            }
        }
    }
}
