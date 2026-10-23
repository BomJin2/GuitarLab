use tract_onnx::{prelude::*, tract_core::internal::ensure};

pub fn classify(samples: &[f32]) -> TractResult<(&'static str, f64)> {
    ensure!(
        samples.len() == super::SAMPLES && samples.iter().all(|v| v.is_finite() && v.abs() <= 1.0),
        "분석 입력 규격 오류"
    );
    let mean = samples.iter().map(|v| f64::from(*v)).sum::<f64>() / samples.len() as f64;
    let power = samples
        .iter()
        .map(|v| (f64::from(*v) - mean).powi(2))
        .sum::<f64>()
        / samples.len() as f64;
    let dbfs = 20.0 * power.sqrt().max(1e-12).log10();
    let clipped = samples.iter().filter(|v| v.abs() >= 0.995).count();
    let state = if clipped as f64 / samples.len() as f64 >= 0.001 {
        "CLIPPED"
    } else if dbfs < -65.0 {
        "NO_SIGNAL"
    } else {
        "ANALYZE"
    };
    Ok((state, dbfs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_dc_and_very_quiet_input_do_not_reach_model() {
        for samples in [
            vec![0.0; super::super::SAMPLES],
            vec![0.5; super::super::SAMPLES],
            super::super::signal(1e-6, false),
        ] {
            assert_eq!(classify(&samples).expect("유한 입력").0, "NO_SIGNAL");
        }
        assert_eq!(
            classify(&super::super::signal(0.001, false))
                .expect("작은 단음")
                .0,
            "ANALYZE"
        );
    }

    #[test]
    fn invalid_and_clipped_input_are_not_analyzed() {
        assert!(classify(&[0.0]).is_err());
        assert!(classify(&vec![f32::NAN; super::super::SAMPLES]).is_err());
        assert_eq!(
            classify(&super::super::signal(1.0, false))
                .expect("클리핑")
                .0,
            "CLIPPED"
        );
    }
}
