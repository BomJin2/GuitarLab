use crate::ipc::AppError;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationEstimate {
    pub bias_real_ms: f64,
    pub jitter_real_ms: f64,
    pub samples_used: usize,
    pub samples_rejected: usize,
}
fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let center = values.len() / 2;
    if values.len().is_multiple_of(2) {
        (values[center - 1] + values[center]) / 2.0
    } else {
        values[center]
    }
}
pub fn estimate(observed_real_deltas_ms: &[f64]) -> Result<CalibrationEstimate, AppError> {
    if !(8..=64).contains(&observed_real_deltas_ms.len())
        || observed_real_deltas_ms
            .iter()
            .any(|value| !value.is_finite() || value.abs() > 500.0)
    {
        return Err(AppError::invalid());
    }
    let mut values = observed_real_deltas_ms.to_vec();
    let center = median(&mut values);
    let mut deviations: Vec<f64> = values.iter().map(|value| (value - center).abs()).collect();
    let mad = median(&mut deviations);
    let cutoff = (3.0 * 1.4826 * mad).max(10.0);
    values.retain(|value| (value - center).abs() <= cutoff);
    if values.len() < 8 {
        return Err(AppError::new(
            "CALIBRATION_REQUIRED",
            "유효한 반복 측정이 8개 이상 필요합니다. 다시 측정하세요.",
            true,
        ));
    }
    let bias = median(&mut values);
    let mut residual: Vec<f64> = values.iter().map(|value| (value - bias).abs()).collect();
    Ok(CalibrationEstimate {
        bias_real_ms: bias,
        jitter_real_ms: 1.4826 * median(&mut residual),
        samples_used: values.len(),
        samples_rejected: observed_real_deltas_ms.len() - values.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn positive_late_bias_and_outlier_are_measured() {
        let result =
            estimate(&[29.0, 30.0, 31.0, 28.0, 32.0, 30.0, 29.0, 31.0, 350.0]).expect("보정 측정");
        assert_eq!(result.bias_real_ms, 30.0);
        assert_eq!(result.samples_used, 8);
        assert_eq!(result.samples_rejected, 1);
        assert!(result.jitter_real_ms < 2.0);
    }
    #[test]
    fn early_bias_and_zero_jitter_have_no_sign_flip() {
        let result = estimate(&[-25.0; 8]).expect("음수 보정");
        assert_eq!(result.bias_real_ms, -25.0);
        assert_eq!(result.jitter_real_ms, 0.0);
    }
    #[test]
    fn invalid_or_too_few_clean_samples_are_rejected() {
        assert!(estimate(&[0.0; 7]).is_err());
        assert!(estimate(&[f64::NAN; 8]).is_err());
        assert!(estimate(&[501.0; 8]).is_err());
        assert!(estimate(&[30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 400.0]).is_err());
    }
}
