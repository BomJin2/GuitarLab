use std::{
    fs::{File, OpenOptions},
    io::{self, BufReader, BufWriter, Read, Seek, SeekFrom, Write},
    path::Path,
};

pub const HEADER_BYTES: u64 = 58;
pub const MAX_BYTES: u64 = 256 * 1024 * 1024;
pub fn frame_limit(sample_rate: u32) -> u64 {
    (u64::from(sample_rate) * 600).min((MAX_BYTES - HEADER_BYTES) / 4)
}
fn invalid() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "녹음 WAV 형식 또는 샘플이 유효하지 않습니다.",
    )
}
pub(crate) fn header(sample_rate: u32, frames: u64) -> io::Result<[u8; 58]> {
    if !(8000..=192000).contains(&sample_rate) || frames > frame_limit(sample_rate) {
        return Err(invalid());
    }
    let bytes = u32::try_from(frames * 4).map_err(|_| invalid())?;
    let mut h = [0; 58];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&(bytes + 50).to_le_bytes());
    h[8..16].copy_from_slice(b"WAVEfmt ");
    h[16..20].copy_from_slice(&18u32.to_le_bytes());
    h[20..22].copy_from_slice(&3u16.to_le_bytes());
    h[22..24].copy_from_slice(&1u16.to_le_bytes());
    h[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    h[28..32].copy_from_slice(&(sample_rate * 4).to_le_bytes());
    h[32..34].copy_from_slice(&4u16.to_le_bytes());
    h[34..36].copy_from_slice(&32u16.to_le_bytes());
    h[38..42].copy_from_slice(b"fact");
    h[42..46].copy_from_slice(&4u32.to_le_bytes());
    h[46..50].copy_from_slice(&(frames as u32).to_le_bytes());
    h[50..54].copy_from_slice(b"data");
    h[54..58].copy_from_slice(&bytes.to_le_bytes());
    Ok(h)
}

pub struct WaveWriter<W: Write + Seek> {
    output: W,
    sample_rate: u32,
    pub frames: u64,
    pub peak: f32,
}
impl<W: Write + Seek> WaveWriter<W> {
    pub fn new(mut output: W, sample_rate: u32) -> io::Result<Self> {
        output.write_all(&header(sample_rate, 0)?)?;
        output.flush()?;
        Ok(Self {
            output,
            sample_rate,
            frames: 0,
            peak: 0.0,
        })
    }
    pub fn push(&mut self, value: f32) -> io::Result<()> {
        if !value.is_finite() || self.frames >= frame_limit(self.sample_rate) {
            return Err(invalid());
        }
        self.output.write_all(&value.to_le_bytes())?;
        self.frames += 1;
        self.peak = self.peak.max(value.abs());
        Ok(())
    }
    pub fn flush(&mut self) -> io::Result<()> {
        self.output.flush()
    }
    pub fn finish(mut self) -> io::Result<W> {
        self.output.flush()?;
        self.output.seek(SeekFrom::Start(0))?;
        self.output
            .write_all(&header(self.sample_rate, self.frames)?)?;
        self.output.flush()?;
        Ok(self.output)
    }
}
pub fn create(path: &Path, sample_rate: u32) -> io::Result<WaveWriter<BufWriter<File>>> {
    let file = OpenOptions::new().write(true).create_new(true).open(path)?;
    let mut writer = WaveWriter::new(BufWriter::with_capacity(32768, file), sample_rate)?;
    writer.output.get_ref().sync_all()?;
    writer.flush()?;
    Ok(writer)
}
pub fn finish(writer: WaveWriter<BufWriter<File>>) -> io::Result<()> {
    writer.finish()?.get_ref().sync_all()
}

pub struct WaveReader {
    input: BufReader<File>,
    pub sample_rate: u32,
    pub frames: u64,
    remaining: u64,
}
impl WaveReader {
    pub fn open(path: &Path, allow_unfinished: bool) -> io::Result<Self> {
        let mut input = BufReader::new(File::open(path)?);
        let len = input.get_ref().metadata()?.len();
        if !(HEADER_BYTES..=MAX_BYTES).contains(&len) {
            return Err(invalid());
        }
        let mut h = [0; 58];
        input.read_exact(&mut h)?;
        let sample_rate = u32::from_le_bytes(h[24..28].try_into().map_err(|_| invalid())?);
        let frames = (len - HEADER_BYTES) / 4;
        let expected = header(sample_rate, frames)?;
        let format_matches = h[0..4] == expected[0..4]
            && h[8..46] == expected[8..46]
            && h[50..54] == expected[50..54];
        if !format_matches
            || (!allow_unfinished && (h != expected || !(len - HEADER_BYTES).is_multiple_of(4)))
        {
            return Err(invalid());
        }
        Ok(Self {
            input,
            sample_rate,
            frames,
            remaining: frames,
        })
    }
    pub fn next_sample(&mut self) -> io::Result<Option<f32>> {
        if self.remaining == 0 {
            return Ok(None);
        }
        let mut bytes = [0; 4];
        self.input.read_exact(&mut bytes)?;
        let value = f32::from_le_bytes(bytes);
        if !value.is_finite() {
            return Err(invalid());
        }
        self.remaining -= 1;
        Ok(Some(value))
    }
}

#[cfg(windows)]
pub fn available_bytes(directory: &Path) -> io::Result<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let path: Vec<u16> = directory.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0;
    // 유효한 NUL 종료 경로와 살아 있는 u64 출력만 Windows API에 전달합니다.
    let result = unsafe {
        GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(available)
    }
}

#[cfg(not(windows))]
pub fn available_bytes(_directory: &Path) -> io::Result<u64> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "이 빌드는 Windows 디스크 검사만 지원합니다.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    #[test]
    #[ignore = "독립 디코더 검사용 합성 WAV 산출물을 명시적으로 생성"]
    fn export_synthetic_wave_for_independent_decoder() {
        let directory = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/recording-validation");
        std::fs::create_dir_all(&directory).expect("합성 검사 폴더");
        let path = directory.join(format!("four-seconds-{}.wav", uuid::Uuid::new_v4()));
        let mut writer = create(&path, 48000).expect("새 fixture");
        for i in 0..192000 {
            writer
                .push((i as f32 * 0.01).sin() * 0.5)
                .expect("합성 입력");
        }
        finish(writer).expect("fixture 확정");
        println!("합성 WAV: {}", path.display());
    }
    #[test]
    fn four_seconds_preserve_float_pcm_and_reject_invalid_samples() {
        let mut writer = WaveWriter::new(Cursor::new(Vec::new()), 48000).expect("WAV");
        for i in 0..192000 {
            writer.push((i as f32 * 0.01).sin() * 1.2).expect("샘플");
        }
        assert_eq!(writer.frames, 192000);
        assert!(writer.peak > 1.19);
        assert!(writer.push(f32::NAN).is_err());
        let bytes = writer.finish().expect("확정").into_inner();
        assert_eq!(bytes.len(), 58 + 192000 * 4);
        assert_eq!(&bytes[46..50], &192000u32.to_le_bytes());
        assert_eq!(
            &bytes[58 + 1234 * 4..58 + 1235 * 4],
            &((1234f32 * 0.01).sin() * 1.2).to_le_bytes()
        );
        assert!(WaveWriter::new(Cursor::new(Vec::new()), 7999).is_err());
    }
    struct FullDisk(Cursor<Vec<u8>>);
    impl Write for FullDisk {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if self.0.position() >= 62 {
                return Err(io::Error::other("디스크 부족 fixture"));
            }
            self.0.write(bytes)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    impl Seek for FullDisk {
        fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
            self.0.seek(pos)
        }
    }
    #[test]
    fn disk_failure_is_visible_without_advancing_frame_count() {
        let mut writer = WaveWriter::new(FullDisk(Cursor::new(Vec::new())), 48000).expect("헤더");
        writer.push(0.5).expect("첫 프레임");
        assert!(writer.push(0.25).is_err());
        assert_eq!(writer.frames, 1);
    }
}
