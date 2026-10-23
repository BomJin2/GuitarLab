#![cfg_attr(all(target_os = "windows", not(test)), windows_subsystem = "windows")]
fn main() {
    guitarlab_lib::run();
}
