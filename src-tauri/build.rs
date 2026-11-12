fn main() {
    // R5 배속 재생: Signalsmith Stretch(MIT, vendor/signalsmith)를 C 래퍼와 함께 컴파일합니다.
    println!("cargo:rerun-if-changed=vendor/signalsmith");
    cc::Build::new()
        .cpp(true)
        .std("c++17")
        .file("vendor/signalsmith/guitarlab_stretch.cpp")
        .include("vendor/signalsmith")
        .include("vendor/signalsmith/stretch")
        .flag_if_supported("/EHsc")
        .warnings(false)
        // 최적화하지 않은 템플릿 DSP는 수십 배 느려 debug 검증앱에서도 실시간을 놓치지 않게 늘 최적화합니다.
        .opt_level(2)
        .compile("guitarlab_stretch");
    tauri_build::build()
}
