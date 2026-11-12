//! docs/12 "네이티브 배속 재생 v1"(재생 Rust 이전 R5): 피치를 유지한 채 재생 속도를 바꿉니다.
//! Signalsmith Stretch(MIT, `vendor/signalsmith`)를 C 래퍼로 부릅니다. `process`가 내부에서 할당할 수 있어
//! 출력 callback이 아니라 작업 스레드에서만 씁니다.
use std::ffi::{c_int, c_long, c_void};

extern "C" {
    fn guitarlab_stretch_create(channels: c_int, sample_rate: f32, seed: c_long) -> *mut c_void;
    fn guitarlab_stretch_destroy(handle: *mut c_void);
    fn guitarlab_stretch_reset(handle: *mut c_void);
    fn guitarlab_stretch_input_latency(handle: *mut c_void) -> c_int;
    fn guitarlab_stretch_output_latency(handle: *mut c_void) -> c_int;
    fn guitarlab_stretch_seek_length(handle: *mut c_void) -> c_int;
    fn guitarlab_stretch_seek(
        handle: *mut c_void,
        input: *const *mut f32,
        frames: c_int,
        rate: f64,
    ) -> c_int;
    fn guitarlab_stretch_output_seek(
        handle: *mut c_void,
        input: *const *mut f32,
        frames: c_int,
    ) -> c_int;
    fn guitarlab_stretch_output_seek_length(handle: *mut c_void, rate: f32) -> c_int;
    fn guitarlab_stretch_process(
        handle: *mut c_void,
        input: *const *mut f32,
        input_frames: c_int,
        output: *const *mut f32,
        output_frames: c_int,
    ) -> c_int;
}

/// stereo 고정 늘이기. 같은 seed면 같은 입력에 같은 결과를 냅니다(검사 재현).
pub struct Stretch {
    handle: *mut c_void,
}
// 한 스레드에서만 쓰며 다른 스레드로 옮기는 것은 안전합니다(내부 공유 상태 없음).
unsafe impl Send for Stretch {}

impl Stretch {
    pub fn new(sample_rate: u32) -> Option<Self> {
        // SAFETY: 실패하면 null을 돌려주며, 성공한 핸들은 Drop에서 한 번만 해제합니다.
        let handle = unsafe { guitarlab_stretch_create(2, sample_rate as f32, 1) };
        (!handle.is_null()).then_some(Self { handle })
    }
    pub fn reset(&mut self) {
        // SAFETY: 유효한 핸들.
        unsafe { guitarlab_stretch_reset(self.handle) }
    }
    /// 입력 쪽 지연(프레임): 지금 넣는 입력과 내부 처리 위치의 차이.
    pub fn input_latency(&self) -> usize {
        // SAFETY: 유효한 핸들.
        unsafe { guitarlab_stretch_input_latency(self.handle) }.max(0) as usize
    }
    /// 출력 쪽 지연(프레임).
    pub fn output_latency(&self) -> usize {
        // SAFETY: 유효한 핸들.
        unsafe { guitarlab_stretch_output_latency(self.handle) }.max(0) as usize
    }
    /// 위치를 옮길 때 미리 넣어 줄 입력 길이.
    pub fn seek_length(&self) -> usize {
        // SAFETY: 유효한 핸들.
        unsafe { guitarlab_stretch_seek_length(self.handle) }.max(0) as usize
    }
    /// 새 위치 직전의 입력(pre-roll)을 넣습니다. 출력은 나오지 않습니다.
    pub fn seek(&mut self, left: &mut [f32], right: &mut [f32], rate: f64) -> bool {
        let frames = left.len().min(right.len());
        let input = [left.as_mut_ptr(), right.as_mut_ptr()];
        // SAFETY: 두 채널 모두 frames 길이 이상이고 호출 동안 살아 있습니다.
        unsafe { guitarlab_stretch_seek(self.handle, input.as_ptr(), frames as c_int, rate) == 1 }
    }
    /// `output_seek`에 넣어야 할 입력 길이(입력 지연 + rate × 출력 지연).
    pub fn output_seek_length(&self, rate: f64) -> usize {
        // SAFETY: 유효한 핸들.
        unsafe { guitarlab_stretch_output_seek_length(self.handle, rate as f32) }.max(0) as usize
    }
    /// 상태를 비우고, 다음 `process` 출력의 첫 프레임이 입력 첫 프레임과 맞도록 미리 계산합니다.
    pub fn output_seek(&mut self, left: &mut [f32], right: &mut [f32]) -> bool {
        let frames = left.len().min(right.len());
        let input = [left.as_mut_ptr(), right.as_mut_ptr()];
        // SAFETY: 두 채널 모두 frames 길이 이상이고 호출 동안 살아 있습니다.
        unsafe { guitarlab_stretch_output_seek(self.handle, input.as_ptr(), frames as c_int) == 1 }
    }
    /// 입력 `input_*`를 받아 출력 `out_*`를 채웁니다. 속도 = 입력 길이 / 출력 길이.
    pub fn process(
        &mut self,
        in_left: &mut [f32],
        in_right: &mut [f32],
        out_left: &mut [f32],
        out_right: &mut [f32],
    ) -> bool {
        let input_frames = in_left.len().min(in_right.len());
        let output_frames = out_left.len().min(out_right.len());
        let input = [in_left.as_mut_ptr(), in_right.as_mut_ptr()];
        let output = [out_left.as_mut_ptr(), out_right.as_mut_ptr()];
        // SAFETY: 각 채널 버퍼가 해당 길이 이상이고 호출 동안 살아 있으며 입력·출력이 겹치지 않습니다.
        unsafe {
            guitarlab_stretch_process(
                self.handle,
                input.as_ptr(),
                input_frames as c_int,
                output.as_ptr(),
                output_frames as c_int,
            ) == 1
        }
    }
}
impl Drop for Stretch {
    fn drop(&mut self) {
        // SAFETY: new에서 만든 핸들을 한 번만 해제합니다.
        unsafe { guitarlab_stretch_destroy(self.handle) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    /// 영점 교차 수로 주파수(Hz)를 셉니다.
    fn frequency(s: &[f32], rate: u32) -> f64 {
        let crossings = s.windows(2).filter(|w| w[0] <= 0.0 && w[1] > 0.0).count();
        crossings as f64 * f64::from(rate) / s.len() as f64
    }
    #[test]
    fn output_seek_aligns_first_output_with_song_position() {
        // 곡 위치 P에서 시작하면 출력 j프레임은 곡 P + j × rate. 클릭으로 확인합니다.
        let rate = 48000u32;
        let mut stretch = Stretch::new(rate).expect("엔진");
        for speed in [0.5f64, 0.75, 1.25, 1.5] {
            let click_at = 24000usize; // 시작 위치 뒤 0.5초
            let song = |i: usize| {
                if (click_at..click_at + 32).contains(&i) {
                    0.8f32
                } else {
                    0.0
                }
            };
            let seek = stretch.output_seek_length(speed);
            let (mut l, mut r): (Vec<f32>, Vec<f32>) =
                ((0..seek).map(song).collect(), (0..seek).map(song).collect());
            assert!(stretch.output_seek(&mut l, &mut r));
            let mut cursor = seek;
            let block = 256usize;
            let mut out = Vec::new();
            let mut song_pos = 0.0f64;
            while out.len() < 48000 {
                let need = ((song_pos + block as f64 * speed).round() as usize + seek)
                    .saturating_sub(cursor);
                let (mut il, mut ir): (Vec<f32>, Vec<f32>) = (
                    (cursor..cursor + need).map(song).collect(),
                    (cursor..cursor + need).map(song).collect(),
                );
                cursor += need;
                song_pos += block as f64 * speed;
                let (mut ol, mut or) = (vec![0.0; block], vec![0.0; block]);
                assert!(stretch.process(&mut il, &mut ir, &mut ol, &mut or));
                out.extend(ol);
            }
            let peak = (0..out.len())
                .max_by(|a, b| out[*a].abs().total_cmp(&out[*b].abs()))
                .unwrap();
            let expected = click_at as f64 / speed;
            // 2026-11-11 실측 0.5~0.9ms. 1.5ms 안이어야 합니다.
            assert!(
                (peak as f64 - expected).abs() < 72.0,
                "속도 {speed}: 클릭 출력 {peak}, 기대 {expected:.0}"
            );
        }
    }
    #[test]
    fn stretch_keeps_pitch_while_changing_speed() {
        let rate = 48000u32;
        let mut stretch = Stretch::new(rate).expect("엔진");
        assert!(stretch.input_latency() > 0 && stretch.output_latency() > 0);
        for speed in [0.5f64, 0.75, 1.25, 1.5] {
            stretch.reset();
            // 440Hz 사인 2초를 블록으로 넣고 출력 1초를 받습니다.
            let out_frames = rate as usize;
            let in_frames = (out_frames as f64 * speed).round() as usize;
            let mut l: Vec<f32> = (0..in_frames)
                .map(|i| (i as f32 * 440.0 / rate as f32 * std::f32::consts::TAU).sin() * 0.5)
                .collect();
            let mut r = l.clone();
            let (mut ol, mut or) = (vec![0.0f32; out_frames], vec![0.0f32; out_frames]);
            assert!(stretch.process(&mut l, &mut r, &mut ol, &mut or));
            // 앞쪽 지연 구간을 빼고 피치가 그대로(440Hz ± 2%)인지 봅니다.
            let tail = &ol[out_frames / 2..];
            let f = frequency(tail, rate);
            assert!((f - 440.0).abs() < 9.0, "속도 {speed}: {f}Hz");
            assert!(tail.iter().all(|v| v.is_finite()));
        }
    }
}
