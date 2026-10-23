use super::{
    database::connect,
    project_model::{storage_error, validate_uuid, MAX_SAFE},
    projects::{hash, now_ms, ProjectStore},
};
use crate::{
    ipc::AppError,
    judgement::practice::{AttemptSnapshot, PracticeEvent, PracticeTarget},
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

pub const SCORING_VERSION: &str = "monophonic-poc-v2";
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PracticeArchiveRequest {
    pub project_id: String,
    pub session_id: String,
    pub range_start_ms: f64,
    pub range_end_ms: f64,
}
pub struct ArchiveBinding {
    context: PracticeArchiveRequest,
    revision_id: String,
    track_id: String,
    measures: HashMap<String, u32>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAttempt {
    pub schema_version: u8,
    pub project_id: String,
    pub session_id: String,
    pub attempt_id: String,
    pub revision_id: String,
    pub track_id: String,
    pub scoring_version: String,
    pub config_fingerprint: String,
    pub state: String,
    pub started_at_ms: i64,
    pub ended_at_ms: Option<i64>,
    pub completed_order: Option<u64>,
    pub snapshot: Value,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredEvent {
    pub sequence: u64,
    pub measure_index: u32,
    pub event: Value,
}
fn gap() -> AppError {
    AppError::new(
        "ARCHIVE_EVENT_GAP",
        "판정 이벤트 기록에 누락이 있어 저장을 중단했습니다. 기존 기록을 보존했습니다.",
        true,
    )
}
fn verified_json(text: &str, digest: &str) -> Result<Value, AppError> {
    if text.len() > 2 * 1024 * 1024 || hash(text.as_bytes()) != digest {
        return Err(storage_error());
    }
    serde_json::from_str(text).map_err(|_| storage_error())
}
impl ProjectStore {
    pub fn prepare_archive(
        &self,
        context: PracticeArchiveRequest,
        revision_id: &str,
        track_id: &str,
        targets: &[PracticeTarget],
    ) -> Result<ArchiveBinding, AppError> {
        validate_uuid(&context.project_id)?;
        validate_uuid(&context.session_id)?;
        if !context.range_start_ms.is_finite()
            || !context.range_end_ms.is_finite()
            || context.range_start_ms < 0.0
            || context.range_end_ms > 86_400_000.0
            || context.range_end_ms <= context.range_start_ms
        {
            return Err(AppError::invalid());
        }
        let revision = self.revision(&context.project_id, revision_id)?;
        let track = revision
            .score
            .tracks
            .iter()
            .find(|track| track.id == track_id)
            .ok_or_else(AppError::invalid)?;
        let anchors = &revision.score.sync_anchors;
        let mut expected = Vec::new();
        let mut measures = HashMap::new();
        for note in &track.notes {
            if note.attack == Some(false) {
                continue;
            }
            let pair = anchors
                .windows(2)
                .find(|pair| pair[1].score_tick > note.start_tick)
                .unwrap_or_else(|| &anchors[anchors.len() - 2..]);
            let time = pair[0].audio_time_ms
                + (note.start_tick as f64 - pair[0].score_tick as f64)
                    * (pair[1].audio_time_ms - pair[0].audio_time_ms)
                    / (pair[1].score_tick - pair[0].score_tick) as f64;
            if time >= context.range_start_ms && time < context.range_end_ms {
                expected.push((
                    note.id.clone(),
                    time,
                    note.pitch_midi,
                    note.judgement_support.is_some(),
                ));
                measures.insert(note.id.clone(), note.measure_index);
            }
        }
        expected.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        if expected.len() != targets.len()
            || expected.is_empty()
            || expected.iter().zip(targets).any(|(expected, target)| {
                expected.0 != target.id
                    || expected.2 != target.pitch_midi
                    || expected.3 != target.unsupported
                    || !target.song_time_ms.is_finite()
                    || (expected.1 - target.song_time_ms).abs() > 0.000001
            })
        {
            return Err(AppError::new(
                "REVISION_CONFLICT",
                "연습 대상이 저장한 악보와 다릅니다. 악보와 싱크를 저장한 뒤 다시 시작하세요.",
                true,
            ));
        }
        Ok(ArchiveBinding {
            context,
            revision_id: revision_id.into(),
            track_id: track_id.into(),
            measures,
        })
    }
    pub fn archive_attempt(
        &self,
        binding: &ArchiveBinding,
        snapshot: &AttemptSnapshot,
        events: &[PracticeEvent],
    ) -> Result<(), AppError> {
        validate_uuid(&snapshot.attempt_id)?;
        if snapshot.score_revision != binding.revision_id
            || snapshot.track_id != binding.track_id
            || snapshot.event_sequence > MAX_SAFE
            || !["RUNNING", "FINISHED", "STOPPED", "INVALIDATED"].contains(&snapshot.state)
        {
            return Err(AppError::invalid());
        }
        let config = json!({"revisionId":binding.revision_id,"trackId":binding.track_id,"rate":snapshot.rate,
            "calibrationRevision":snapshot.calibration_revision,"calibrationProfile":snapshot.calibration_profile,
            "coolMs":snapshot.cool_ms,"goodMs":snapshot.good_ms,"pitchToleranceCents":snapshot.pitch_tolerance_cents,
            "rangeStartMs":binding.context.range_start_ms,"rangeEndMs":binding.context.range_end_ms,"scoringVersion":SCORING_VERSION});
        let config = serde_json::to_string(&config).map_err(|_| storage_error())?;
        let fingerprint = hash(config.as_bytes());
        let summary = serde_json::to_string(snapshot).map_err(|_| storage_error())?;
        if summary.len() > 2 * 1024 * 1024 {
            return Err(storage_error());
        }
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.summary(&tx, &binding.context.project_id)?;
        let time = now_ms()?;
        let existing_session:Option<(String,String,String,String)>=tx.query_row("SELECT project_id,score_revision_id,track_id,config_fingerprint FROM practice_sessions WHERE id=?1",[&binding.context.session_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).optional().map_err(|_|storage_error())?;
        if let Some((project, revision, track, previous)) = existing_session {
            if project != binding.context.project_id
                || revision != binding.revision_id
                || track != binding.track_id
                || previous != fingerprint
            {
                return Err(AppError::invalid());
            }
        } else {
            tx.execute("INSERT INTO practice_sessions(id,project_id,score_revision_id,track_id,config_json,config_fingerprint,scoring_version,started_at_ms,status) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'RUNNING')",
                params![binding.context.session_id,binding.context.project_id,binding.revision_id,binding.track_id,config,fingerprint,SCORING_VERSION,time]).map_err(|_|storage_error())?;
        }
        let existing_attempt:Option<(String,String,i64,String)>=tx.query_row("SELECT session_id,state,last_event_sequence,summary_sha256 FROM practice_attempts WHERE id=?1",[&snapshot.attempt_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).optional().map_err(|_|storage_error())?;
        let mut last = 0u64;
        if let Some((session, state, sequence, previous_hash)) = existing_attempt {
            if session != binding.context.session_id || sequence < 0 {
                return Err(AppError::invalid());
            }
            last = u64::try_from(sequence).map_err(|_| storage_error())?;
            if state != "RUNNING"
                && (snapshot.state != state || hash(summary.as_bytes()) != previous_hash)
            {
                return Err(AppError::invalid());
            }
        } else {
            tx.execute("INSERT INTO practice_attempts(id,session_id,playback_epoch,state,summary_json,summary_sha256,started_at_ms) VALUES(?1,?2,?3,'RUNNING',?4,?5,?6)",
                params![snapshot.attempt_id,binding.context.session_id,i64::try_from(snapshot.playback_epoch).map_err(|_|AppError::invalid())?,summary,hash(summary.as_bytes()),time]).map_err(|_|storage_error())?;
        }
        for event in events {
            let measure = binding
                .measures
                .get(&event.note_id)
                .ok_or_else(AppError::invalid)?;
            let text = serde_json::to_string(event).map_err(|_| storage_error())?;
            let digest = hash(text.as_bytes());
            let sequence = i64::try_from(event.sequence).map_err(|_| AppError::invalid())?;
            if event.sequence <= last {
                let existing:String=tx.query_row("SELECT event_sha256 FROM judgement_events WHERE attempt_id=?1 AND sequence=?2",params![snapshot.attempt_id,sequence],|row|row.get(0)).map_err(|_|gap())?;
                if existing != digest {
                    return Err(gap());
                }
                continue;
            }
            if event.sequence != last + 1 {
                return Err(gap());
            }
            tx.execute("INSERT INTO judgement_events(attempt_id,sequence,note_id,measure_index,event_json,event_sha256) VALUES(?1,?2,?3,?4,?5,?6)",params![snapshot.attempt_id,sequence,event.note_id,measure,text,digest]).map_err(|_|storage_error())?;
            last = event.sequence;
        }
        if last != snapshot.event_sequence {
            return Err(gap());
        }
        let ended = if snapshot.state == "RUNNING" {
            None
        } else {
            Some(time)
        };
        let completed_order: Option<i64> = if snapshot.state == "FINISHED" {
            Some(
                tx.query_row(
                    "SELECT COALESCE(MAX(completed_order),0)+1 FROM practice_attempts",
                    [],
                    |row| row.get(0),
                )
                .map_err(|_| storage_error())?,
            )
        } else {
            None
        };
        tx.execute("UPDATE practice_attempts SET state=?1,summary_json=?2,summary_sha256=?3,last_event_sequence=?4,ended_at_ms=COALESCE(ended_at_ms,?5),completed_order=COALESCE(completed_order,?7) WHERE id=?6",
            params![snapshot.state,summary,hash(summary.as_bytes()),i64::try_from(last).map_err(|_|AppError::invalid())?,ended,snapshot.attempt_id,completed_order]).map_err(|_|storage_error())?;
        tx.execute(
            "UPDATE practice_sessions SET status=?1,ended_at_ms=?2 WHERE id=?3",
            params![snapshot.state, ended, binding.context.session_id],
        )
        .map_err(|_| storage_error())?;
        tx.commit().map_err(|_| storage_error())
    }
    pub fn attempts(&self, project_id: &str) -> Result<Vec<StoredAttempt>, AppError> {
        validate_uuid(project_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let mut statement=db.prepare("SELECT s.project_id,s.id,a.id,s.score_revision_id,s.track_id,s.scoring_version,s.config_fingerprint,a.state,a.started_at_ms,a.ended_at_ms,a.summary_json,a.summary_sha256,a.completed_order FROM practice_attempts a JOIN practice_sessions s ON s.id=a.session_id WHERE s.project_id=?1 ORDER BY a.started_at_ms DESC,a.id").map_err(|_|storage_error())?;
        let rows = statement
            .query_map([project_id], |row| {
                Ok((
                    StoredAttempt {
                        schema_version: 1,
                        project_id: row.get(0)?,
                        session_id: row.get(1)?,
                        attempt_id: row.get(2)?,
                        revision_id: row.get(3)?,
                        track_id: row.get(4)?,
                        scoring_version: row.get(5)?,
                        config_fingerprint: row.get(6)?,
                        state: row.get(7)?,
                        started_at_ms: row.get(8)?,
                        ended_at_ms: row.get(9)?,
                        completed_order: row
                            .get::<_, Option<i64>>(12)?
                            .map(|v| {
                                u64::try_from(v)
                                    .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(12, v))
                            })
                            .transpose()?,
                        snapshot: Value::Null,
                    },
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                ))
            })
            .map_err(|_| storage_error())?;
        rows.map(|row| {
            let (mut value, text, digest) = row.map_err(|_| storage_error())?;
            value.snapshot = verified_json(&text, &digest)?;
            validate_uuid(&value.attempt_id).map_err(|_| storage_error())?;
            Ok(value)
        })
        .collect()
    }
    pub fn events(
        &self,
        project_id: &str,
        attempt_id: &str,
        after_sequence: u64,
    ) -> Result<Vec<StoredEvent>, AppError> {
        self.events_through(project_id, attempt_id, after_sequence, MAX_SAFE)
    }
    pub fn events_through(
        &self,
        project_id: &str,
        attempt_id: &str,
        after_sequence: u64,
        through_sequence: u64,
    ) -> Result<Vec<StoredEvent>, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(attempt_id)?;
        if after_sequence > MAX_SAFE || through_sequence > MAX_SAFE {
            return Err(AppError::invalid());
        }
        let after = i64::try_from(after_sequence).map_err(|_| AppError::invalid())?;
        let through = i64::try_from(through_sequence).map_err(|_| AppError::invalid())?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let exists:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM practice_attempts a JOIN practice_sessions s ON s.id=a.session_id WHERE s.project_id=?1 AND a.id=?2)",params![project_id,attempt_id],|r|r.get(0)).map_err(|_|storage_error())?;
        if !exists {
            return Err(AppError::invalid());
        }
        let mut statement=db.prepare("SELECT sequence,measure_index,event_json,event_sha256 FROM judgement_events WHERE attempt_id=?1 AND sequence>?2 AND sequence<=?3 ORDER BY sequence LIMIT 500").map_err(|_|storage_error())?;
        let rows = statement
            .query_map(params![attempt_id, after, through], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, u32>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|_| storage_error())?;
        rows.map(|row| {
            let (sequence, measure_index, text, digest) = row.map_err(|_| storage_error())?;
            Ok(StoredEvent {
                sequence: u64::try_from(sequence).map_err(|_| storage_error())?,
                measure_index,
                event: verified_json(&text, &digest)?,
            })
        })
        .collect()
    }
}
